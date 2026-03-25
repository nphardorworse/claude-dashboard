import { Hono } from "hono";
import { getProjectPath, getSettingsPath } from "../lib/paths";
import { readJsonFile, writeJsonFile, ensureDir } from "../lib/file-io";
import { dirname } from "path";

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

    const projectPath = await getProjectPath(c);
    const settingsPath = getSettingsPath(projectPath);

    if (projectPath) {
      await ensureDir(dirname(settingsPath));
    }

    const { settings, hooks: hooksMap } = await readHooks(settingsPath);

    if (eventHooks.length === 0) {
      delete hooksMap[event];
    } else {
      hooksMap[event] = eventHooks;
    }

    settings.hooks = hooksMap;
    await writeJsonFile(settingsPath, settings);

    return c.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return c.json({ error: message }, 500);
  }
});

// DELETE /:event — remove all hooks for a given event
hooks.delete("/:event", async (c) => {
  try {
    const event = c.req.param("event");

    const projectPath = await getProjectPath(c);
    const settingsPath = getSettingsPath(projectPath);

    if (projectPath) {
      await ensureDir(dirname(settingsPath));
    }

    const { settings, hooks: hooksMap } = await readHooks(settingsPath);

    if (!hooksMap[event]) {
      return c.json({ error: `No hooks found for event "${event}"` }, 404);
    }

    delete hooksMap[event];
    settings.hooks = hooksMap;
    await writeJsonFile(settingsPath, settings);

    return c.json({ ok: true });
  } catch (err) {
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

    if (!event || !matcher || !command) {
      return c.json(
        { error: "Invalid request: event, matcher, and command required" },
        400
      );
    }

    const projectPath = await getProjectPath(c);
    const settingsPath = getSettingsPath(projectPath);

    if (projectPath) {
      await ensureDir(dirname(settingsPath));
    }

    const { settings, hooks: hooksMap } = await readHooks(settingsPath);

    const newHookCommand: HookCommand = { type: "command", command };
    if (timeout != null) {
      newHookCommand.timeout = timeout;
    }

    const eventHooks = hooksMap[event] ?? [];

    // Find an existing entry with the same matcher, or create a new one
    const existingEntry = eventHooks.find((e) => e.matcher === matcher);
    if (existingEntry) {
      existingEntry.hooks.push(newHookCommand);
    } else {
      eventHooks.push({ matcher, hooks: [newHookCommand] });
    }

    hooksMap[event] = eventHooks;
    settings.hooks = hooksMap;
    await writeJsonFile(settingsPath, settings);

    return c.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return c.json({ error: message }, 500);
  }
});

export { hooks };
