import { Hono } from "hono";
import { PATHS, getProjectPath, getMcpJsonPath, validateProjectPath } from "../lib/paths";
import { readJsonFile, writeJsonFile, ensureDir } from "../lib/file-io";
import { checkMcpHealth } from "../lib/mcp-health";
import { withFileLock } from "../lib/file-lock";
import { buildCatalog } from "../lib/catalog-builder";
import { scanPluginMcps } from "../lib/plugin-mcp-scanner";
import { dirname } from "path";
import type { ClaudeJson, ProjectEntry } from "../lib/types";
import type { McpOrigin, McpServerConfig } from "../../shared/types";
import { validateMcpName, validateMcpCommand, validateMcpUrl, validateMcpArgs, validateMcpEnv } from "../lib/validation";

// Fix 2: Runtime validation constants for origin and action
const VALID_ORIGINS = ["global", "global-disabled", "plugin", "project", "personal", "cloud"] as const;
const VALID_ACTIONS = ["enable", "disable"] as const;

// Fix 6: Rate limit tracking for health checks
let lastHealthCheckTime = 0;
const HEALTH_CHECK_MIN_INTERVAL_MS = 5_000;

type DashboardConfig = {
  pinnedMcpServers?: string[];
  [key: string]: unknown;
};

const mcp = new Hono();

// GET /catalog — full MCP catalog with origin groups, health, and project status
mcp.get("/catalog", async (c) => {
  try {
    const projectPath = await getProjectPath(c);
    const catalog = await buildCatalog(projectPath ?? undefined);
    return c.json(catalog);
  } catch (err) {
    console.error("[GET /catalog]", err);
    if (err instanceof SyntaxError) return c.json({ error: "Invalid request body" }, 400);
    const message = err instanceof Error ? err.message : "Unknown error";
    return c.json({ error: message }, 500);
  }
});

// POST /servers — add a new MCP server
mcp.post("/servers", async (c) => {
  try {
    const body = (await c.req.json()) as {
      name: string;
      command?: string;
      url?: string;
      args?: string[];
      env?: Record<string, string>;
    };
    const { name, command, url: serverUrl, args, env } = body;

    const nameResult = validateMcpName(name);
    if (!nameResult.valid) return c.json({ error: nameResult.error }, 400);

    if (!command && !serverUrl) {
      return c.json({ error: "Either command or url is required" }, 400);
    }
    if (command && serverUrl) {
      return c.json({ error: "Provide either command or url, not both" }, 400);
    }

    let cmdResult: { valid: true; value: string } | undefined;
    let urlResult: { valid: true; value: string } | undefined;

    if (command) {
      const r = validateMcpCommand(command);
      if (!r.valid) return c.json({ error: r.error }, 400);
      cmdResult = r;
    } else {
      const r = validateMcpUrl(serverUrl);
      if (!r.valid) return c.json({ error: r.error }, 400);
      urlResult = r;
    }

    const argsResult = validateMcpArgs(args);
    if (!argsResult.valid) return c.json({ error: argsResult.error }, 400);

    const envResult = validateMcpEnv(env);
    if (!envResult.valid) return c.json({ error: envResult.error }, 400);

    const projectPath = await getProjectPath(c);
    const mcpPath = getMcpJsonPath(projectPath);

    if (projectPath) {
      await ensureDir(dirname(mcpPath));
    }

    return await withFileLock(mcpPath, async () => {
      const data = (await readJsonFile<ClaudeJson>(mcpPath)) ?? {};
      const mcpServers = data.mcpServers ?? {};

      if (mcpServers[nameResult.value]) {
        return c.json(
          { error: `Server "${nameResult.value}" already exists` },
          409
        );
      }

      const serverConfig: McpServerConfig = cmdResult
        ? { command: cmdResult.value }
        : { url: urlResult!.value };
      if (argsResult.value && argsResult.value.length > 0) {
        serverConfig.args = argsResult.value;
      }
      if (envResult.value && Object.keys(envResult.value).length > 0) {
        serverConfig.env = envResult.value;
      }

      mcpServers[nameResult.value] = serverConfig;
      data.mcpServers = mcpServers;

      await writeJsonFile(mcpPath, data);

      return c.json({ ok: true, name: nameResult.value });
    });
  } catch (err) {
    console.error("[POST /servers]", err);
    if (err instanceof SyntaxError) return c.json({ error: "Invalid request body" }, 400);
    const message = err instanceof Error ? err.message : "Unknown error";
    return c.json({ error: message }, 500);
  }
});

// DELETE /servers/:name — remove an MCP server
mcp.delete("/servers/:name", async (c) => {
  try {
    const nameResult = validateMcpName(c.req.param("name"));
    if (!nameResult.valid) return c.json({ error: nameResult.error }, 400);
    const name = nameResult.value;

    const projectPath = await getProjectPath(c);
    const mcpPath = getMcpJsonPath(projectPath);

    return await withFileLock(mcpPath, async () => {
      const data = (await readJsonFile<ClaudeJson>(mcpPath)) ?? {};
      const mcpServers = data.mcpServers ?? {};

      if (!mcpServers[name]) {
        return c.json({ error: `Server "${name}" not found` }, 404);
      }

      delete mcpServers[name];
      data.mcpServers = mcpServers;

      await writeJsonFile(mcpPath, data);

      return c.json({ ok: true, name });
    });
  } catch (err) {
    console.error("[DELETE /servers/:name]", err);
    if (err instanceof SyntaxError) return c.json({ error: "Invalid request body" }, 400);
    const message = err instanceof Error ? err.message : "Unknown error";
    return c.json({ error: message }, 500);
  }
});

// PUT /project-toggle — toggle MCP enable/disable for a specific project
mcp.put("/project-toggle", async (c) => {
  try {
    const { projectPath, mcpName, origin, action } = await c.req.json<{
      projectPath: string;
      mcpName: string;
      origin: McpOrigin;
      action: "enable" | "disable";
    }>();

    if (!projectPath || !mcpName || !origin || !action) {
      return c.json({ error: "projectPath, mcpName, origin, and action are required" }, 400);
    }

    // Fix 1: Validate body-sourced projectPath against allowlist
    const validatedPath = await validateProjectPath(projectPath);
    if (!validatedPath) {
      return c.json({ error: "Invalid or unknown projectPath" }, 400);
    }

    // Fix 3: Validate mcpName from body
    const nameResult = validateMcpName(mcpName);
    if (!nameResult.valid) return c.json({ error: nameResult.error }, 400);

    // Fix 2: Runtime validation for origin and action
    if (!(VALID_ORIGINS as readonly string[]).includes(origin)) {
      return c.json({ error: `Invalid origin: "${origin}"` }, 400);
    }
    if (!(VALID_ACTIONS as readonly string[]).includes(action)) {
      return c.json({ error: `Invalid action: "${action}"` }, 400);
    }

    // Fix 4: Pinned-list check moved inside withFileLock to prevent TOCTOU race
    return await withFileLock(PATHS.claudeJson, async () => {
      if (action === "disable") {
        const dashConfig = await readJsonFile<DashboardConfig>(PATHS.dashboardConfig);
        const pinnedSet = new Set(dashConfig?.pinnedMcpServers ?? []);
        if (pinnedSet.has(nameResult.value)) {
          return c.json({ error: `"${nameResult.value}" is pinned and cannot be disabled` }, 409);
        }
      }

      const claudeJson = (await readJsonFile<ClaudeJson>(PATHS.claudeJson)) ?? {};
      const projects = claudeJson.projects ?? {};
      const projEntry = (projects[validatedPath] ?? {}) as ProjectEntry;

      if ((origin === "global" || origin === "cloud") && action === "disable") {
        const disabled = new Set(projEntry.disabledMcpServers ?? []);
        disabled.add(nameResult.value);
        projEntry.disabledMcpServers = Array.from(disabled);
      } else if ((origin === "global" || origin === "cloud") && action === "enable") {
        projEntry.disabledMcpServers = (projEntry.disabledMcpServers ?? []).filter(
          (n) => n !== nameResult.value
        );
      } else if (origin === "plugin" && action === "disable") {
        const disabled = new Set(projEntry.disabledMcpjsonServers ?? []);
        disabled.add(nameResult.value);
        projEntry.disabledMcpjsonServers = Array.from(disabled);
      } else if (origin === "plugin" && action === "enable") {
        projEntry.disabledMcpjsonServers = (projEntry.disabledMcpjsonServers ?? []).filter(
          (n) => n !== nameResult.value
        );
      } else if (origin === "personal" && action === "disable") {
        if (projEntry.mcpServers) {
          delete projEntry.mcpServers[nameResult.value];
        }
      } else if (origin === "global-disabled" && action === "enable") {
        const globalDisabled = claudeJson.disabledMcpServers ?? {};
        const sourceConfig = globalDisabled[nameResult.value];
        if (!sourceConfig) {
          return c.json({ error: `"${nameResult.value}" not found in global disabled MCPs` }, 404);
        }
        // Strip the "enabled: false" flag so Claude Code treats it as active
        delete (sourceConfig as Record<string, unknown>).enabled;
        // Move from disabled to active globally
        const globalActive = claudeJson.mcpServers ?? {};
        globalActive[nameResult.value] = sourceConfig;
        claudeJson.mcpServers = globalActive;
        delete globalDisabled[nameResult.value];
        claudeJson.disabledMcpServers = globalDisabled;
      } else {
        return c.json(
          { error: `Unsupported combination: origin="${origin}", action="${action}"` },
          400
        );
      }

      projects[validatedPath] = projEntry;
      claudeJson.projects = projects;
      await writeJsonFile(PATHS.claudeJson, claudeJson);

      return c.json({ ok: true, mcpName: nameResult.value, action });
    });
  } catch (err) {
    console.error("[PUT /project-toggle]", err);
    if (err instanceof SyntaxError) return c.json({ error: "Invalid request body" }, 400);
    const message = err instanceof Error ? err.message : "Unknown error";
    return c.json({ error: message }, 500);
  }
});

// POST /copy-to-project — copy an MCP config into a project's personal MCPs
// Validate an MCP server config supplied by the client (the catalog entry it's
// copying). Reuses the same per-field validators as POST /servers, so a copied
// config is held to the same standard as a hand-added one.
const validateServerConfig = (
  config: unknown,
):
  | { valid: true; value: McpServerConfig }
  | { valid: false; error: string } => {
  if (!config || typeof config !== "object") {
    return { valid: false, error: "config must be an object" };
  }
  const c = config as McpServerConfig;
  const hasCommand = typeof c.command === "string" && c.command.trim().length > 0;
  const hasUrl = typeof c.url === "string" && c.url.trim().length > 0;
  if (hasCommand === hasUrl) {
    return { valid: false, error: "config must have either a command or a url" };
  }

  const out: McpServerConfig = {};
  if (hasCommand) {
    const r = validateMcpCommand(c.command);
    if (!r.valid) return { valid: false, error: r.error };
    out.command = r.value;
  } else {
    const r = validateMcpUrl(c.url);
    if (!r.valid) return { valid: false, error: r.error };
    out.url = r.value;
  }

  const argsResult = validateMcpArgs(c.args);
  if (!argsResult.valid) return { valid: false, error: argsResult.error };
  if (argsResult.value && argsResult.value.length > 0) out.args = argsResult.value;

  const envResult = validateMcpEnv(c.env);
  if (!envResult.valid) return { valid: false, error: envResult.error };
  if (envResult.value && Object.keys(envResult.value).length > 0) out.env = envResult.value;

  if (typeof c.type === "string" && ["stdio", "http", "sse"].includes(c.type)) {
    out.type = c.type;
  }

  return { valid: true, value: out };
};

mcp.post("/copy-to-project", async (c) => {
  try {
    const { mcpName, targetProjectPath, config: rawConfig } = await c.req.json<{
      mcpName: string;
      targetProjectPath: string;
      config?: unknown;
    }>();

    if (!mcpName || !targetProjectPath) {
      return c.json({ error: "mcpName and targetProjectPath are required" }, 400);
    }

    // Fix 1: Validate body-sourced targetProjectPath against allowlist
    const validatedPath = await validateProjectPath(targetProjectPath);
    if (!validatedPath) {
      return c.json({ error: "Invalid or unknown targetProjectPath" }, 400);
    }

    // Fix 3: Validate mcpName from body
    const nameResult = validateMcpName(mcpName);
    if (!nameResult.valid) return c.json({ error: nameResult.error }, 400);

    // If the client sent the config from the catalog entry it's copying,
    // validate and use it. This is the only reliable way to copy an MCP whose
    // config lives in another project's .mcp.json: the server can't resolve it
    // by name (the same name maps to different configs across projects).
    let suppliedConfig: McpServerConfig | null = null;
    if (rawConfig != null) {
      const v = validateServerConfig(rawConfig);
      if (!v.valid) return c.json({ error: v.error }, 400);
      suppliedConfig = v.value;
    }

    // Pre-fetch cached plugin MCPs outside the lock (cheap, cached)
    const pluginMcps = await scanPluginMcps();

    return await withFileLock(PATHS.claudeJson, async () => {
      const claudeJson = (await readJsonFile<ClaudeJson>(PATHS.claudeJson)) ?? {};

      // Prefer the client-supplied config (validated above). Otherwise resolve
      // by name from global active/disabled, the target project, or plugins.
      let foundConfig: McpServerConfig | null = suppliedConfig;

      if (!foundConfig && claudeJson.mcpServers?.[nameResult.value]) {
        foundConfig = claudeJson.mcpServers[nameResult.value];
      }
      if (!foundConfig && claudeJson.disabledMcpServers?.[nameResult.value]) {
        foundConfig = claudeJson.disabledMcpServers[nameResult.value];
      }
      if (!foundConfig && claudeJson.projects) {
        const pe = (claudeJson.projects[validatedPath] ?? {}) as ProjectEntry;
        if (pe.mcpServers?.[nameResult.value]) {
          foundConfig = pe.mcpServers[nameResult.value];
        }
      }
      if (!foundConfig) {
        const pluginMatch = pluginMcps.find((pm) => pm.mcpName === nameResult.value);
        if (pluginMatch) foundConfig = pluginMatch.config;
      }

      if (!foundConfig) {
        return c.json({ error: `MCP "${nameResult.value}" not found in catalog` }, 404);
      }

      if (!foundConfig.command && !foundConfig.url) {
        return c.json(
          { error: `MCP "${nameResult.value}" has no command or url — cannot copy cloud MCPs` },
          400
        );
      }

      const projects = claudeJson.projects ?? {};
      const projEntry = (projects[validatedPath] ?? {}) as ProjectEntry;

      projEntry.mcpServers = projEntry.mcpServers ?? {};
      projEntry.mcpServers[nameResult.value] = foundConfig;

      projects[validatedPath] = projEntry;
      claudeJson.projects = projects;
      await writeJsonFile(PATHS.claudeJson, claudeJson);

      return c.json({ ok: true, mcpName: nameResult.value, targetProjectPath: validatedPath });
    });
  } catch (err) {
    console.error("[POST /copy-to-project]", err);
    if (err instanceof SyntaxError) return c.json({ error: "Invalid request body" }, 400);
    const message = err instanceof Error ? err.message : "Unknown error";
    return c.json({ error: message }, 500);
  }
});

// PUT /pinned — set the pinned MCP list
mcp.put("/pinned", async (c) => {
  try {
    const { servers } = await c.req.json<{ servers: string[] }>();

    if (!Array.isArray(servers)) {
      return c.json({ error: "servers array required" }, 400);
    }

    // Fix 5: Validate each item in the servers array
    for (const item of servers) {
      const result = validateMcpName(item);
      if (!result.valid) {
        return c.json({ error: `Invalid server name in pinned list: ${result.error}` }, 400);
      }
    }

    return await withFileLock(PATHS.dashboardConfig, async () => {
      const config = (await readJsonFile<DashboardConfig>(PATHS.dashboardConfig)) ?? {};
      config.pinnedMcpServers = servers;
      await writeJsonFile(PATHS.dashboardConfig, config);
      return c.json({ ok: true, pinned: servers.length });
    });
  } catch (err) {
    console.error("[PUT /pinned]", err);
    if (err instanceof SyntaxError) return c.json({ error: "Invalid request body" }, 400);
    const message = err instanceof Error ? err.message : "Unknown error";
    return c.json({ error: message }, 500);
  }
});

// PUT /global-toggle — enable/disable an MCP globally (moves between mcpServers and disabledMcpServers)
mcp.put("/global-toggle", async (c) => {
  try {
    const { mcpName, action } = await c.req.json<{
      mcpName: string;
      action: "enable" | "disable";
    }>();

    if (!mcpName || !action) {
      return c.json({ error: "mcpName and action required" }, 400);
    }

    // Fix 3: Validate mcpName from body
    const nameResult = validateMcpName(mcpName);
    if (!nameResult.valid) return c.json({ error: nameResult.error }, 400);

    // Fix 2: Runtime validation for action
    if (!(VALID_ACTIONS as readonly string[]).includes(action)) {
      return c.json({ error: `Invalid action: "${action}"` }, 400);
    }

    // Fix 4: Pinned-list check moved inside withFileLock to prevent TOCTOU race
    return await withFileLock(PATHS.claudeJson, async () => {
      if (action === "disable") {
        const dashConfig = await readJsonFile<DashboardConfig>(PATHS.dashboardConfig);
        const pinnedSet = new Set(dashConfig?.pinnedMcpServers ?? []);
        if (pinnedSet.has(nameResult.value)) {
          return c.json({ error: `"${nameResult.value}" is pinned and cannot be disabled` }, 409);
        }
      }

      const claudeJson = (await readJsonFile<ClaudeJson>(PATHS.claudeJson)) ?? {};
      const active = claudeJson.mcpServers ?? {};
      const disabled = claudeJson.disabledMcpServers ?? {};

      if (action === "disable") {
        const config = active[nameResult.value];
        if (!config) {
          return c.json({ error: `"${nameResult.value}" not found in active global MCPs` }, 404);
        }
        disabled[nameResult.value] = config;
        delete active[nameResult.value];
      } else {
        const config = disabled[nameResult.value];
        if (!config) {
          return c.json({ error: `"${nameResult.value}" not found in disabled global MCPs` }, 404);
        }
        // Strip the "enabled: false" flag so Claude Code treats it as active
        delete (config as Record<string, unknown>).enabled;
        active[nameResult.value] = config;
        delete disabled[nameResult.value];
      }

      claudeJson.mcpServers = active;
      claudeJson.disabledMcpServers = disabled;
      await writeJsonFile(PATHS.claudeJson, claudeJson);

      return c.json({ ok: true, mcpName: nameResult.value, action });
    });
  } catch (err) {
    console.error("[PUT /global-toggle]", err);
    if (err instanceof SyntaxError) return c.json({ error: "Invalid request body" }, 400);
    const message = err instanceof Error ? err.message : "Unknown error";
    return c.json({ error: message }, 500);
  }
});

// POST /health-check — run a fresh health check
mcp.post("/health-check", async (c) => {
  try {
    // Fix 6: Rate limit — if last non-cached check was within minimum interval, use cache
    const now = Date.now();
    const bypassCache = now - lastHealthCheckTime >= HEALTH_CHECK_MIN_INTERVAL_MS;
    if (bypassCache) {
      lastHealthCheckTime = now;
    }
    const healthResults = await checkMcpHealth(bypassCache);
    return c.json({ results: healthResults });
  } catch (err) {
    console.error("[POST /health-check]", err);
    if (err instanceof SyntaxError) return c.json({ error: "Invalid request body" }, 400);
    const message = err instanceof Error ? err.message : "Unknown error";
    return c.json({ error: message }, 500);
  }
});

export { mcp };
