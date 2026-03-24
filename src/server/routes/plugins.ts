import { Hono } from "hono";
import { PATHS, getProjectPath, getSettingsPath } from "../lib/paths";
import { readJsonFile, writeJsonFile, ensureDir } from "../lib/file-io";
import { scanPlugins } from "../lib/plugin-scanner";
import { dirname } from "path";
import type {
  PluginsResponse,
  ToggleRequest,
  BulkToggleRequest,
} from "../../shared/types";

type SettingsJson = {
  enabledPlugins?: Record<string, boolean>;
  [key: string]: unknown;
};

const plugins = new Hono();

// GET / — scan all plugins and return enriched list + summary
plugins.get("/", async (c) => {
  try {
    const projectPath = getProjectPath(c);
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

    if (!pluginId || typeof enabled !== "boolean") {
      return c.json({ error: "Invalid request: pluginId and enabled required" }, 400);
    }

    const projectPath = getProjectPath(c);
    const settingsPath = getSettingsPath(projectPath);

    if (projectPath) {
      await ensureDir(dirname(settingsPath));
    }

    const settings =
      (await readJsonFile<SettingsJson>(settingsPath)) ?? {};
    const enabledPlugins = settings.enabledPlugins ?? {};

    enabledPlugins[pluginId] = enabled;
    settings.enabledPlugins = enabledPlugins;

    await writeJsonFile(settingsPath, settings);

    return c.json({ ok: true, pluginId, enabled });
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

    const projectPath = getProjectPath(c);
    const settingsPath = getSettingsPath(projectPath);

    if (projectPath) {
      await ensureDir(dirname(settingsPath));
    }

    const settings =
      (await readJsonFile<SettingsJson>(settingsPath)) ?? {};
    const enabledPlugins = settings.enabledPlugins ?? {};

    for (const pluginId of pluginIds) {
      enabledPlugins[pluginId] = enabled;
    }

    settings.enabledPlugins = enabledPlugins;
    await writeJsonFile(settingsPath, settings);

    return c.json({ ok: true, pluginIds, enabled });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return c.json({ error: message }, 500);
  }
});

export { plugins };
