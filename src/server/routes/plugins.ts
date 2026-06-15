import { Hono } from "hono";
import { PATHS, getProjectPath, getSettingsPath } from "../lib/paths";
import { readJsonFile, writeJsonFile, ensureDir } from "../lib/file-io";
import { withFileLock } from "../lib/file-lock";
import { scanPlugins } from "../lib/plugin-scanner";
import { validateSettingsId } from "../lib/validation";
import { resolveClaudeBin } from "../lib/claude-cli";
import { execFile } from "child_process";
import { promisify } from "util";
import { homedir } from "os";
import { dirname } from "path";
import type {
  PluginsResponse,
  ToggleRequest,
  BulkToggleRequest,
} from "../../shared/types";

const execFileAsync = promisify(execFile);

type SettingsJson = {
  enabledPlugins?: Record<string, boolean>;
  [key: string]: unknown;
};

type InstalledPluginEntry = {
  scope?: string;
  projectPath?: string;
};

type InstalledPluginsFile = {
  plugins?: Record<string, InstalledPluginEntry[]>;
};

const plugins = new Hono();

// GET / — scan all plugins and return enriched list + summary
plugins.get("/", async (c) => {
  try {
    const projectPath = await getProjectPath(c);
    const settingsPath = getSettingsPath(projectPath);

    const pluginList = await scanPlugins(
      projectPath ? settingsPath : undefined
    );

    const activeCount = pluginList.filter((p) => p.enabled).length;
    const totalEstimatedTokens = pluginList
      .filter((p) => p.enabled)
      .reduce((sum, p) => sum + p.estimatedTokens, 0);

    // Count project-level overrides when in project scope
    let projectOverrides = 0;
    if (projectPath) {
      const projectSettings = await readJsonFile<SettingsJson>(settingsPath);
      projectOverrides = Object.keys(
        projectSettings?.enabledPlugins ?? {}
      ).length;
    }

    const response: PluginsResponse & {
      scope: "global" | "project";
      projectOverrides: number;
    } = {
      plugins: pluginList,
      activeCount,
      totalEstimatedTokens,
      scope: projectPath ? "project" : "global",
      projectOverrides,
    };

    return c.json(response);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return c.json({ error: message }, 500);
  }
});

// PUT /toggle — toggle a single plugin on/off
plugins.put("/toggle", async (c) => {
  try {
    const body = (await c.req.json()) as ToggleRequest;
    const { pluginId, enabled } = body;

    if (typeof enabled !== "boolean") {
      return c.json({ error: "Invalid request: pluginId and enabled required" }, 400);
    }
    const idCheck = validateSettingsId(pluginId, "pluginId");
    if (!idCheck.valid) return c.json({ error: idCheck.error }, 400);

    const projectPath = await getProjectPath(c);
    const settingsPath = getSettingsPath(projectPath);

    if (projectPath) {
      await ensureDir(dirname(settingsPath));
    }

    return await withFileLock(settingsPath, async () => {
      const settings =
        (await readJsonFile<SettingsJson>(settingsPath)) ?? {};
      const enabledPlugins = settings.enabledPlugins ?? {};

      enabledPlugins[idCheck.value] = enabled;
      settings.enabledPlugins = enabledPlugins;

      await writeJsonFile(settingsPath, settings);

      return c.json({ ok: true, pluginId: idCheck.value, enabled });
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return c.json({ error: message }, 500);
  }
});

// PUT /bulk-toggle — toggle multiple plugins at once
plugins.put("/bulk-toggle", async (c) => {
  try {
    const body = (await c.req.json()) as BulkToggleRequest;
    const { pluginIds, enabled } = body;

    if (!Array.isArray(pluginIds) || typeof enabled !== "boolean") {
      return c.json(
        { error: "Invalid request: pluginIds array and enabled required" },
        400
      );
    }
    for (const id of pluginIds) {
      const idCheck = validateSettingsId(id, "pluginId");
      if (!idCheck.valid) return c.json({ error: idCheck.error }, 400);
    }

    const projectPath = await getProjectPath(c);
    const settingsPath = getSettingsPath(projectPath);

    if (projectPath) {
      await ensureDir(dirname(settingsPath));
    }

    return await withFileLock(settingsPath, async () => {
      const settings =
        (await readJsonFile<SettingsJson>(settingsPath)) ?? {};
      const enabledPlugins = settings.enabledPlugins ?? {};

      for (const pluginId of pluginIds) {
        enabledPlugins[pluginId] = enabled;
      }

      settings.enabledPlugins = enabledPlugins;
      await writeJsonFile(settingsPath, settings);

      return c.json({ ok: true, pluginIds, enabled });
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return c.json({ error: message }, 500);
  }
});

// POST /uninstall — uninstall a plugin via the Claude CLI (the canonical path:
// it cleans installed_plugins.json, the shared cache dir, and dependencies).
// A plugin may be installed in several scopes (user/project/local); uninstall
// each one it's present in, running project/local scopes from the project cwd.
plugins.post("/uninstall", async (c) => {
  try {
    const { pluginId } = await c.req.json<{ pluginId: string }>();

    const idCheck = validateSettingsId(pluginId, "pluginId");
    if (!idCheck.valid) return c.json({ error: idCheck.error }, 400);
    const id = idCheck.value;

    const installed = await readJsonFile<InstalledPluginsFile>(PATHS.installedPlugins);
    const entries = installed?.plugins?.[id];
    if (!entries || entries.length === 0) {
      return c.json({ error: `Plugin "${id}" is not installed` }, 404);
    }

    // Distinct (scope, cwd) targets — dedupe so we don't uninstall twice.
    const targets = new Map<string, { scope: string; cwd: string }>();
    for (const e of entries) {
      const scope = e.scope ?? "user";
      const cwd =
        (scope === "project" || scope === "local") && e.projectPath
          ? e.projectPath
          : homedir();
      targets.set(`${scope}:${cwd}`, { scope, cwd });
    }

    const bin = resolveClaudeBin();
    const outputs: string[] = [];
    for (const { scope, cwd } of targets.values()) {
      try {
        const { stdout, stderr } = await execFileAsync(
          bin,
          ["plugin", "uninstall", id, "-s", scope, "-y"],
          { cwd, timeout: 60_000, env: process.env }
        );
        outputs.push(`${stdout}${stderr}`.trim());
      } catch (err) {
        // Spawn error / timeout — the CLI exits 0 even on logical failures, so
        // this path is mostly missing-binary or timeout. Capture and continue;
        // the post-check below is authoritative.
        const detail =
          err && typeof err === "object" && "stderr" in err
            ? String((err as { stderr: unknown }).stderr)
            : err instanceof Error
              ? err.message
              : String(err);
        outputs.push(`${scope}: ${detail}`.trim());
      }
    }

    // Authoritative check: the CLI exits 0 even when it fails, so confirm the
    // plugin is actually gone from the registry rather than trusting the exit.
    const after = await readJsonFile<InstalledPluginsFile>(PATHS.installedPlugins);
    if (after?.plugins?.[id]?.length) {
      const detail = outputs.filter(Boolean).join("; ").slice(0, 400);
      return c.json(
        { error: `Uninstall did not complete${detail ? ` — ${detail}` : ""}` },
        500
      );
    }
    return c.json({ ok: true, pluginId: id });
  } catch (err) {
    if (err instanceof SyntaxError) return c.json({ error: "Invalid request body" }, 400);
    const message = err instanceof Error ? err.message : "Unknown error";
    return c.json({ error: message }, 500);
  }
});

export { plugins };
