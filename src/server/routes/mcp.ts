import { Hono } from "hono";
import { PATHS, getProjectPath, getMcpJsonPath } from "../lib/paths";
import { readJsonFile, writeJsonFile, ensureDir } from "../lib/file-io";
import { checkMcpHealth } from "../lib/mcp-health";
import { withFileLock } from "../lib/file-lock";
import { buildCatalog } from "../lib/catalog-builder";
import { scanPluginMcps } from "../lib/plugin-mcp-scanner";
import { dirname } from "path";
import type { ClaudeJson, ProjectEntry } from "../lib/types";
import type { McpOrigin, McpServerConfig } from "../../shared/types";

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
    const message = err instanceof Error ? err.message : "Unknown error";
    return c.json({ error: message }, 500);
  }
});

// POST /servers — add a new MCP server
mcp.post("/servers", async (c) => {
  try {
    const body = (await c.req.json()) as {
      name: string;
      command: string;
      args?: string[];
      env?: Record<string, string>;
    };
    const { name, command, args, env } = body;

    if (!name || typeof name !== "string" || !name.trim()) {
      return c.json({ error: "Server name is required" }, 400);
    }
    if (!command || typeof command !== "string" || !command.trim()) {
      return c.json({ error: "Command is required" }, 400);
    }

    const projectPath = await getProjectPath(c);
    const mcpPath = getMcpJsonPath(projectPath);

    if (projectPath) {
      await ensureDir(dirname(mcpPath));
    }

    return withFileLock(mcpPath, async () => {
      const data = (await readJsonFile<ClaudeJson>(mcpPath)) ?? {};
      const mcpServers = data.mcpServers ?? {};

      if (mcpServers[name.trim()]) {
        return c.json(
          { error: `Server "${name.trim()}" already exists` },
          409
        );
      }

      const serverConfig: McpServerConfig = { command: command.trim() };
      if (args && args.length > 0) {
        serverConfig.args = args;
      }
      if (env && Object.keys(env).length > 0) {
        serverConfig.env = env;
      }

      mcpServers[name.trim()] = serverConfig;
      data.mcpServers = mcpServers;

      await writeJsonFile(mcpPath, data);

      return c.json({ ok: true, name: name.trim() });
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return c.json({ error: message }, 500);
  }
});

// DELETE /servers/:name — remove an MCP server
mcp.delete("/servers/:name", async (c) => {
  try {
    const name = c.req.param("name");

    const projectPath = await getProjectPath(c);
    const mcpPath = getMcpJsonPath(projectPath);

    return withFileLock(mcpPath, async () => {
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

    // Check pinned — pinned MCPs cannot be disabled
    if (action === "disable") {
      const dashConfig = await readJsonFile<DashboardConfig>(PATHS.dashboardConfig);
      const pinnedSet = new Set(dashConfig?.pinnedMcpServers ?? []);
      if (pinnedSet.has(mcpName)) {
        return c.json({ error: `"${mcpName}" is pinned and cannot be disabled` }, 409);
      }
    }

    return withFileLock(PATHS.claudeJson, async () => {
      const claudeJson = (await readJsonFile<ClaudeJson>(PATHS.claudeJson)) ?? {};
      const projects = claudeJson.projects ?? {};
      const projEntry = (projects[projectPath] ?? {}) as ProjectEntry;

      if ((origin === "global" || origin === "cloud") && action === "disable") {
        const disabled = new Set(projEntry.disabledMcpServers ?? []);
        disabled.add(mcpName);
        projEntry.disabledMcpServers = Array.from(disabled);
      } else if ((origin === "global" || origin === "cloud") && action === "enable") {
        projEntry.disabledMcpServers = (projEntry.disabledMcpServers ?? []).filter(
          (n) => n !== mcpName
        );
      } else if (origin === "plugin" && action === "disable") {
        const disabled = new Set(projEntry.disabledMcpjsonServers ?? []);
        disabled.add(mcpName);
        projEntry.disabledMcpjsonServers = Array.from(disabled);
      } else if (origin === "plugin" && action === "enable") {
        projEntry.disabledMcpjsonServers = (projEntry.disabledMcpjsonServers ?? []).filter(
          (n) => n !== mcpName
        );
      } else if (origin === "personal" && action === "disable") {
        if (projEntry.mcpServers) {
          delete projEntry.mcpServers[mcpName];
        }
      } else if (origin === "global-disabled" && action === "enable") {
        const globalDisabled = claudeJson.disabledMcpServers ?? {};
        const sourceConfig = globalDisabled[mcpName];
        if (!sourceConfig) {
          return c.json({ error: `"${mcpName}" not found in global disabled MCPs` }, 404);
        }
        // Move from disabled to active globally
        const globalActive = claudeJson.mcpServers ?? {};
        globalActive[mcpName] = sourceConfig;
        claudeJson.mcpServers = globalActive;
        delete globalDisabled[mcpName];
        claudeJson.disabledMcpServers = globalDisabled;
      } else {
        return c.json(
          { error: `Unsupported combination: origin="${origin}", action="${action}"` },
          400
        );
      }

      projects[projectPath] = projEntry;
      claudeJson.projects = projects;
      await writeJsonFile(PATHS.claudeJson, claudeJson);

      return c.json({ ok: true, mcpName, action });
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return c.json({ error: message }, 500);
  }
});

// POST /copy-to-project — copy an MCP config into a project's personal MCPs
mcp.post("/copy-to-project", async (c) => {
  try {
    const { mcpName, targetProjectPath } = await c.req.json<{
      mcpName: string;
      targetProjectPath: string;
    }>();

    if (!mcpName || !targetProjectPath) {
      return c.json({ error: "mcpName and targetProjectPath are required" }, 400);
    }

    // Pre-fetch cached plugin MCPs outside the lock (cheap, cached)
    const pluginMcps = await scanPluginMcps();

    return withFileLock(PATHS.claudeJson, async () => {
      const claudeJson = (await readJsonFile<ClaudeJson>(PATHS.claudeJson)) ?? {};

      // Look up config directly from claudeJson and plugin MCPs (no health check)
      let foundConfig: McpServerConfig | null = null;

      // Check global active
      if (claudeJson.mcpServers?.[mcpName]) {
        foundConfig = claudeJson.mcpServers[mcpName];
      }
      // Check global disabled
      if (!foundConfig && claudeJson.disabledMcpServers?.[mcpName]) {
        foundConfig = claudeJson.disabledMcpServers[mcpName];
      }
      // Check personal MCPs across all projects
      if (!foundConfig && claudeJson.projects) {
        for (const projEntry of Object.values(claudeJson.projects)) {
          const pe = projEntry as ProjectEntry;
          if (pe.mcpServers?.[mcpName]) {
            foundConfig = pe.mcpServers[mcpName];
            break;
          }
        }
      }
      // Check plugin MCPs
      if (!foundConfig) {
        const pluginMatch = pluginMcps.find((pm) => pm.mcpName === mcpName);
        if (pluginMatch) foundConfig = pluginMatch.config;
      }

      if (!foundConfig) {
        return c.json({ error: `MCP "${mcpName}" not found in catalog` }, 404);
      }

      if (!foundConfig.command && !foundConfig.url) {
        return c.json(
          { error: `MCP "${mcpName}" has no command or url — cannot copy cloud MCPs` },
          400
        );
      }

      const projects = claudeJson.projects ?? {};
      const projEntry = (projects[targetProjectPath] ?? {}) as ProjectEntry;

      projEntry.mcpServers = projEntry.mcpServers ?? {};
      projEntry.mcpServers[mcpName] = foundConfig;

      projects[targetProjectPath] = projEntry;
      claudeJson.projects = projects;
      await writeJsonFile(PATHS.claudeJson, claudeJson);

      return c.json({ ok: true, mcpName, targetProjectPath });
    });
  } catch (err) {
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

    return withFileLock(PATHS.dashboardConfig, async () => {
      const config = (await readJsonFile<DashboardConfig>(PATHS.dashboardConfig)) ?? {};
      config.pinnedMcpServers = servers;
      await writeJsonFile(PATHS.dashboardConfig, config);
      return c.json({ ok: true, pinned: servers.length });
    });
  } catch (err) {
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

    if (action === "disable") {
      const dashConfig = await readJsonFile<DashboardConfig>(PATHS.dashboardConfig);
      const pinnedSet = new Set(dashConfig?.pinnedMcpServers ?? []);
      if (pinnedSet.has(mcpName)) {
        return c.json({ error: `"${mcpName}" is pinned and cannot be disabled` }, 409);
      }
    }

    return withFileLock(PATHS.claudeJson, async () => {
      const claudeJson = (await readJsonFile<ClaudeJson>(PATHS.claudeJson)) ?? {};
      const active = claudeJson.mcpServers ?? {};
      const disabled = claudeJson.disabledMcpServers ?? {};

      if (action === "disable") {
        const config = active[mcpName];
        if (!config) {
          return c.json({ error: `"${mcpName}" not found in active global MCPs` }, 404);
        }
        disabled[mcpName] = config;
        delete active[mcpName];
      } else {
        const config = disabled[mcpName];
        if (!config) {
          return c.json({ error: `"${mcpName}" not found in disabled global MCPs` }, 404);
        }
        active[mcpName] = config;
        delete disabled[mcpName];
      }

      claudeJson.mcpServers = active;
      claudeJson.disabledMcpServers = disabled;
      await writeJsonFile(PATHS.claudeJson, claudeJson);

      return c.json({ ok: true, mcpName, action });
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return c.json({ error: message }, 500);
  }
});

// POST /health-check — run a fresh health check
mcp.post("/health-check", async (c) => {
  try {
    const healthResults = await checkMcpHealth(true);
    return c.json({ results: healthResults });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return c.json({ error: message }, 500);
  }
});

export { mcp };
