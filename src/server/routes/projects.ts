import { Hono } from "hono";
import { basename, join, resolve } from "path";
import { access } from "fs/promises";
import { PATHS, loadKnownProjects } from "../lib/paths";
import { readJsonFile, writeJsonFile, ensureDir } from "../lib/file-io";
import { withFileLock } from "../lib/file-lock";
import { validatePermissions, validateHookEntries, validateHooksMap } from "../lib/validation";

type ModelUsageEntry = {
  inputTokens?: number;
  outputTokens?: number;
  cacheReadInputTokens?: number;
  cacheCreationInputTokens?: number;
  costUSD?: number;
};

type ProjectMeta = {
  lastCost?: number;
  lastModelUsage?: Record<string, ModelUsageEntry>;
  projectOnboardingSeenCount?: number;
  [key: string]: unknown;
};

type ClaudeJsonProjects = Record<string, ProjectMeta>;

type ClaudeJson = {
  projects?: ClaudeJsonProjects;
  [key: string]: unknown;
};

type SettingsJson = {
  permissions?: { allow?: string[] };
  hooks?: Record<string, unknown[]>;
  [key: string]: unknown;
};

type LocalSettingsJson = {
  permissions?: { allow?: string[] };
  enableAllProjectMcpServers?: boolean;
  enabledMcpjsonServers?: string[];
  [key: string]: unknown;
};

type McpJson = {
  mcpServers?: Record<string, unknown>;
  [key: string]: unknown;
};

const pathExists = async (p: string): Promise<boolean> => {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
};

const isNodeModulesPath = (p: string): boolean => {
  return p.includes("node_modules");
};

const projectPaths = (projectPath: string) => ({
  claudeDir: join(projectPath, ".claude"),
  settings: join(projectPath, ".claude", "settings.json"),
  localSettings: join(projectPath, ".claude", "settings.local.json"),
  mcpJson: join(projectPath, ".mcp.json"),
});

const decodeProjectPath = async (
  encoded: string
): Promise<{ valid: true; path: string } | { valid: false; error: string }> => {
  const decoded = Buffer.from(encoded, "base64").toString("utf-8");
  if (!decoded.startsWith("/")) {
    return { valid: false, error: "Project path must be absolute" };
  }
  const resolved = resolve(decoded);
  const known = await loadKnownProjects();
  if (!known.has(resolved)) {
    return { valid: false, error: "Unknown project path" };
  }
  return { valid: true, path: resolved };
};

const projects = new Hono();

// GET / — discover projects from all sources
projects.get("/", async (c) => {
  try {
    const claudeJson = await readJsonFile<ClaudeJson>(PATHS.claudeJson);
    const projectsMap = claudeJson?.projects ?? {};

    // loadKnownProjects merges .claude.json, session-meta, and project dirs
    const allPaths = await loadKnownProjects();

    const results = await Promise.all(
      Array.from(allPaths).map(async (path) => {
        if (isNodeModulesPath(path)) return null;

        const meta = projectsMap[path] ?? {};
        const paths = projectPaths(path);
        const hasSettings = await pathExists(paths.settings);
        const hasLocalSettings = await pathExists(paths.localSettings);
        const hasMcpJson = await pathExists(paths.mcpJson);

        const modelUsage = meta.lastModelUsage
          ? Object.entries(meta.lastModelUsage).map(([model, usage]) => ({
              model,
              inputTokens: usage.inputTokens ?? 0,
              outputTokens: usage.outputTokens ?? 0,
              cacheReadTokens: usage.cacheReadInputTokens ?? 0,
              costUSD: usage.costUSD ?? 0,
            }))
          : [];

        const totalCostUSD = modelUsage.reduce((sum, m) => sum + m.costUSD, 0);

        return {
          path,
          name: basename(path),
          lastCost: meta.lastCost ?? null,
          totalCostUSD: totalCostUSD || (meta.lastCost ?? null),
          modelUsage,
          sessions: meta.projectOnboardingSeenCount ?? 0,
          hasSettings,
          hasLocalSettings,
          hasMcpJson,
        };
      })
    );

    const filtered = results.filter(
      (r): r is NonNullable<typeof r> => r !== null
    );

    filtered.sort((a, b) => a.name.localeCompare(b.name));

    return c.json({ projects: filtered });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return c.json({ error: message }, 500);
  }
});

// GET /:projectPath/settings — read all project config files
projects.get("/:projectPath/settings", async (c) => {
  try {
    const decoded = await decodeProjectPath(c.req.param("projectPath"));
    if (!decoded.valid) return c.json({ error: decoded.error }, 400);
    const projectPath = decoded.path;
    const paths = projectPaths(projectPath);

    const settings = await readJsonFile<SettingsJson>(paths.settings);
    const localSettings = await readJsonFile<LocalSettingsJson>(
      paths.localSettings
    );
    const mcpJson = await readJsonFile<McpJson>(paths.mcpJson);

    const mergedPermissions: string[] = [
      ...(settings?.permissions?.allow ?? []),
      ...(localSettings?.permissions?.allow ?? []),
    ];

    const effectiveConfig = {
      permissions: { allow: mergedPermissions },
      hooks: settings?.hooks ?? {},
      enabledMcpServers: localSettings?.enabledMcpjsonServers ?? [],
    };

    return c.json({
      projectPath,
      settings: settings ?? null,
      localSettings: localSettings ?? null,
      mcpServers: mcpJson ?? null,
      effectiveConfig,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return c.json({ error: message }, 500);
  }
});

// PUT /:projectPath/settings — write .claude/settings.json
projects.put("/:projectPath/settings", async (c) => {
  try {
    const decoded = await decodeProjectPath(c.req.param("projectPath"));
    if (!decoded.valid) return c.json({ error: decoded.error }, 400);
    const projectPath = decoded.path;
    const paths = projectPaths(projectPath);
    const body = await c.req.json<{ settings: Record<string, unknown> }>();

    if (!body.settings || typeof body.settings !== "object") {
      return c.json({ error: "Invalid request: settings object required" }, 400);
    }

    if (body.settings.hooks !== undefined) {
      const hooksCheck = validateHooksMap(body.settings.hooks);
      if (!hooksCheck.valid) return c.json({ error: hooksCheck.error }, 400);
    }

    await ensureDir(paths.claudeDir);
    return await withFileLock(paths.settings, async () => {
      await writeJsonFile(paths.settings, body.settings);
      return c.json({ ok: true });
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return c.json({ error: message }, 500);
  }
});

// PUT /:projectPath/local-settings — write .claude/settings.local.json
projects.put("/:projectPath/local-settings", async (c) => {
  try {
    const decoded = await decodeProjectPath(c.req.param("projectPath"));
    if (!decoded.valid) return c.json({ error: decoded.error }, 400);
    const projectPath = decoded.path;
    const paths = projectPaths(projectPath);
    const body = await c.req.json<{ settings: Record<string, unknown> }>();

    if (!body.settings || typeof body.settings !== "object") {
      return c.json({ error: "Invalid request: settings object required" }, 400);
    }

    if (body.settings.hooks !== undefined) {
      const hooksCheck = validateHooksMap(body.settings.hooks);
      if (!hooksCheck.valid) return c.json({ error: hooksCheck.error }, 400);
    }

    await ensureDir(paths.claudeDir);
    return await withFileLock(paths.localSettings, async () => {
      await writeJsonFile(paths.localSettings, body.settings);
      return c.json({ ok: true });
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return c.json({ error: message }, 500);
  }
});

// PUT /:projectPath/hooks — update hooks in .claude/settings.json
projects.put("/:projectPath/hooks", async (c) => {
  try {
    const decoded = await decodeProjectPath(c.req.param("projectPath"));
    if (!decoded.valid) return c.json({ error: decoded.error }, 400);
    const projectPath = decoded.path;
    const paths = projectPaths(projectPath);
    const body = await c.req.json<{
      event: string;
      hooks: unknown[];
    }>();

    const { event, hooks: eventHooks } = body;

    if (!event || !Array.isArray(eventHooks)) {
      return c.json(
        { error: "Invalid request: event and hooks array required" },
        400
      );
    }

    await ensureDir(paths.claudeDir);
    const settings =
      (await readJsonFile<SettingsJson>(paths.settings)) ?? {};
    const hooksMap = settings.hooks ?? {};

    const entriesCheck = validateHookEntries(eventHooks);
    if (!entriesCheck.valid) return c.json({ error: entriesCheck.error }, 400);

    if (eventHooks.length === 0) {
      delete hooksMap[event];
    } else {
      hooksMap[event] = eventHooks;
    }

    settings.hooks = hooksMap;
    await writeJsonFile(paths.settings, settings);

    return c.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return c.json({ error: message }, 500);
  }
});

// PUT /:projectPath/permissions — update permissions in .claude/settings.local.json
projects.put("/:projectPath/permissions", async (c) => {
  try {
    const decoded = await decodeProjectPath(c.req.param("projectPath"));
    if (!decoded.valid) return c.json({ error: decoded.error }, 400);
    const projectPath = decoded.path;
    const paths = projectPaths(projectPath);
    const body = await c.req.json<{ allow: string[] }>();

    const permResult = validatePermissions(body.allow);
    if (!permResult.valid) {
      return c.json({ error: permResult.error }, 400);
    }

    await ensureDir(paths.claudeDir);
    const localSettings =
      (await readJsonFile<LocalSettingsJson>(paths.localSettings)) ?? {};

    localSettings.permissions = { allow: permResult.value };
    await writeJsonFile(paths.localSettings, localSettings);

    return c.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return c.json({ error: message }, 500);
  }
});

export { projects };
