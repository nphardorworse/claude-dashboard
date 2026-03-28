import { Hono } from "hono";
import { getProjectPath, getSettingsPath } from "../lib/paths";
import { readJsonFile, writeJsonFile, ensureDir } from "../lib/file-io";
import { withFileLock } from "../lib/file-lock";
import { dirname } from "path";
import { validateHookCommand, validateHookMatcher, validateHookTimeout } from "../lib/validation";

const HOOK_EVENTS = [
  "SessionStart",
  "SessionEnd",
  "PreToolUse",
  "PostToolUse",
  "UserPromptSubmit",
  "Notification",
  "Stop",
  "SubagentStop",
  "PreCompact",
  "PostCompact",
  "PermissionRequest",
  "ConfigChange",
  "InstructionsLoaded",
  "StopFailure",
  "SubagentStart",
] as const;

type HookCommand = {
  type: string;
  command: string;
  timeout?: number;
};

type HookEntry = {
  matcher: string;
  hooks: HookCommand[];
};

type HooksMap = Record<string, HookEntry[]>;

type SettingsJson = {
  hooks?: HooksMap;
  [key: string]: unknown;
};

const readHooks = async (settingsPath?: string): Promise<{
  settings: SettingsJson;
  hooks: HooksMap;
  path: string;
}> => {
  const path = settingsPath ?? getSettingsPath();
  const settings =
    (await readJsonFile<SettingsJson>(path)) ?? {};
  const hooks = settings.hooks ?? {};
  return { settings, hooks, path };
};

const countTotalHooks = (hooks: HooksMap): number => {
  let total = 0;
  for (const entries of Object.values(hooks)) {
    for (const entry of entries) {
      total += entry.hooks.length;
    }
  }
  return total;
};

const hooks = new Hono();

// GET / — read all hooks from settings.json
hooks.get("/", async (c) => {
  try {
    const projectPath = await getProjectPath(c);
    const settingsPath = getSettingsPath(projectPath);
    const { hooks: hooksMap } = await readHooks(settingsPath);

    const activeEventCount = Object.keys(hooksMap).length;
    const totalHookCount = countTotalHooks(hooksMap);

    return c.json({
      hooks: hooksMap,
      availableEvents: HOOK_EVENTS,
      activeEventCount,
      totalHookCount,
      scope: projectPath ? "project" : "global",
    });
  } catch (err) {
    console.error("GET /hooks error:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return c.json({ error: message }, 500);
  }
});

// PUT / — update hooks for a specific event
hooks.put("/", async (c) => {
  try {
    const body = await c.req.json<{
      event: string;
      hooks: HookEntry[];
    }>();

    const { event, hooks: eventHooks } = body;

    if (!event || !Array.isArray(eventHooks)) {
      return c.json(
        { error: "Invalid request: event and hooks array required" },
        400
      );
    }

    if (!HOOK_EVENTS.includes(event as typeof HOOK_EVENTS[number])) {
      return c.json({ error: `Unknown hook event: "${event}"` }, 400);
    }

    // Validate each entry's fields
    for (const entry of eventHooks) {
      const matcherCheck = validateHookMatcher(entry.matcher);
      if (!matcherCheck.valid) return c.json({ error: matcherCheck.error }, 400);

      if (!Array.isArray(entry.hooks)) {
        return c.json({ error: "Each entry must have a hooks array" }, 400);
      }

      for (const hook of entry.hooks) {
        if (hook.type !== "command") {
          return c.json({ error: `Invalid hook type: "${hook.type}" (must be "command")` }, 400);
        }
        const cmdCheck = validateHookCommand(hook.command);
        if (!cmdCheck.valid) return c.json({ error: cmdCheck.error }, 400);

        const timeoutCheck = validateHookTimeout(hook.timeout);
        if (!timeoutCheck.valid) return c.json({ error: timeoutCheck.error }, 400);
      }
    }

    const projectPath = await getProjectPath(c);
    const settingsPath = getSettingsPath(projectPath);

    if (projectPath) {
      await ensureDir(dirname(settingsPath));
    }

    return await withFileLock(settingsPath, async () => {
      const { settings, hooks: hooksMap } = await readHooks(settingsPath);

      if (eventHooks.length === 0) {
        delete hooksMap[event];
      } else {
        hooksMap[event] = eventHooks;
      }

      settings.hooks = hooksMap;
      await writeJsonFile(settingsPath, settings);

      return c.json({ ok: true });
    });
  } catch (err) {
    if (err instanceof SyntaxError) {
      return c.json({ error: "Invalid JSON in request body" }, 400);
    }
    console.error("PUT /hooks error:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return c.json({ error: message }, 500);
  }
});

// DELETE /:event — remove all hooks for a given event
hooks.delete("/:event", async (c) => {
  try {
    const event = c.req.param("event");

    if (!HOOK_EVENTS.includes(event as typeof HOOK_EVENTS[number])) {
      return c.json({ error: `Unknown hook event: "${event}"` }, 400);
    }

    const projectPath = await getProjectPath(c);
    const settingsPath = getSettingsPath(projectPath);

    if (projectPath) {
      await ensureDir(dirname(settingsPath));
    }

    return await withFileLock(settingsPath, async () => {
      const { settings, hooks: hooksMap } = await readHooks(settingsPath);

      if (!hooksMap[event]) {
        return c.json({ error: `No hooks found for event "${event}"` }, 404);
      }

      delete hooksMap[event];
      settings.hooks = hooksMap;
      await writeJsonFile(settingsPath, settings);

      return c.json({ ok: true });
    });
  } catch (err) {
    console.error("DELETE /hooks/:event error:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return c.json({ error: message }, 500);
  }
});

// POST /add — add a single hook to an event
hooks.post("/add", async (c) => {
  try {
    const body = await c.req.json<{
      event: string;
      matcher: string;
      command: string;
      timeout?: number;
    }>();

    const { event, matcher, command, timeout } = body;

    if (!event) {
      return c.json({ error: "Event is required" }, 400);
    }

    if (!HOOK_EVENTS.includes(event as typeof HOOK_EVENTS[number])) {
      return c.json({ error: `Unknown hook event: "${event}"` }, 400);
    }

    const matcherResult = validateHookMatcher(matcher);
    if (!matcherResult.valid) return c.json({ error: matcherResult.error }, 400);

    const cmdResult = validateHookCommand(command);
    if (!cmdResult.valid) return c.json({ error: cmdResult.error }, 400);

    const timeoutResult = validateHookTimeout(timeout);
    if (!timeoutResult.valid) return c.json({ error: timeoutResult.error }, 400);

    const projectPath = await getProjectPath(c);
    const settingsPath = getSettingsPath(projectPath);

    if (projectPath) {
      await ensureDir(dirname(settingsPath));
    }

    return await withFileLock(settingsPath, async () => {
      const { settings, hooks: hooksMap } = await readHooks(settingsPath);

      const newHookCommand: HookCommand = { type: "command", command: cmdResult.value };
      if (timeoutResult.value != null) {
        newHookCommand.timeout = timeoutResult.value;
      }

      const eventHooks = hooksMap[event] ?? [];

      // Find an existing entry with the same matcher, or create a new one
      const existingEntry = eventHooks.find((e) => e.matcher === matcherResult.value);
      if (existingEntry) {
        existingEntry.hooks.push(newHookCommand);
      } else {
        eventHooks.push({ matcher: matcherResult.value, hooks: [newHookCommand] });
      }

      hooksMap[event] = eventHooks;
      settings.hooks = hooksMap;
      await writeJsonFile(settingsPath, settings);

      return c.json({ ok: true });
    });
  } catch (err) {
    if (err instanceof SyntaxError) {
      return c.json({ error: "Invalid JSON in request body" }, 400);
    }
    console.error("POST /hooks/add error:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return c.json({ error: message }, 500);
  }
});

export { hooks };
