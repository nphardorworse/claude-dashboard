import { Hono } from "hono";
import { PATHS, getProjectPath, getMcpJsonPath } from "../lib/paths";
import { readJsonFile, writeJsonFile, ensureDir } from "../lib/file-io";
import { checkMcpHealth } from "../lib/mcp-health";
import { withFileLock } from "../lib/file-lock";
import { buildCatalog } from "../lib/catalog-builder";
import { dirname } from "path";
import type { McpServerHealth } from "../lib/mcp-health";
import type { ClaudeJson, ProjectEntry } from "../lib/types";
import type { McpOrigin, McpServerConfig } from "../../shared/types";

type DashboardConfig = {
  pinnedMcpServers?: string[];
  [key: string]: unknown;
};

type McpServerInfo = {
  name: string;
  command: string;
  args: string[];
  env: Record<string, string>;
  type: string;
  status: McpServerHealth["status"];
  source: "global" | "project-file" | "project-settings";
};

const buildServerList = (
  servers: Record<string, McpServerConfig>,
  healthResults: McpServerHealth[],
  source: McpServerInfo["source"]
): McpServerInfo[] => {
  const healthMap = new Map<string, McpServerHealth["status"]>();
  for (const h of healthResults) {
    healthMap.set(h.name, h.status);
  }

  return Object.entries(servers).map(([name, config]) => ({
    name,
    command: config.command ?? config.url ?? "",
    args: config.args ?? [],
    env: config.env ?? {},
    type: config.type ?? "stdio",
    status: healthMap.get(name) ?? "unknown",
    source,
  }));
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

// GET /servers — list all MCP servers with health status (backward compat)
mcp.get("/servers", async (c) => {
  try {
    const projectPath = await getProjectPath(c);
    const healthResults = await checkMcpHealth();

    if (!projectPath) {
      const data = await readJsonFile<ClaudeJson>(PATHS.claudeJson);
      const mcpServers = data?.mcpServers ?? {};
      const configServers = buildServerList(mcpServers, healthResults, "global");

      const configNames = new Set(Object.keys(mcpServers));
      const extraServers = healthResults
        .filter((h) => !configNames.has(h.name))
        .map((h) => ({
          name: h.name,
          command: h.command,
          args: [] as string[],
          env: {} as Record<string, string>,
          type: "stdio",
          status: h.status,
          source: "global" as const,
        }));

      const servers = [...configServers, ...extraServers];
      const connectedCount = servers.filter((s) => s.status === "connected").length;
      return c.json({ servers, connectedCount, scope: "global" });
    }

    const mcpJsonPath = getMcpJsonPath(projectPath);
    const mcpJsonData = await readJsonFile<ClaudeJson>(mcpJsonPath);
    const fileServers = mcpJsonData?.mcpServers ?? {};

    const claudeJson = await readJsonFile<ClaudeJson>(PATHS.claudeJson);
    const settingsServers = claudeJson?.projects?.[projectPath]?.mcpServers ?? {};

    const fromFile = buildServerList(fileServers, healthResults, "project-file");
    const fromSettings = buildServerList(settingsServers, healthResults, "project-settings");

    const seen = new Set(fromFile.map((s) => s.name));
    const merged = [...fromFile, ...fromSettings.filter((s) => !seen.has(s.name))];

    const connectedCount = merged.filter((s) => s.status === "connected").length;

    return c.json({ servers: merged, connectedCount, scope: "project" });
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
        const sourceConfig = claudeJson.disabledMcpServers?.[mcpName];
        if (!sourceConfig) {
          return c.json({ error: `"${mcpName}" not found in global disabled MCPs` }, 404);
        }
        projEntry.mcpServers = projEntry.mcpServers ?? {};
        projEntry.mcpServers[mcpName] = sourceConfig;
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

    // Find the MCP config from the catalog
    const catalog = await buildCatalog();
    let foundConfig: McpServerConfig | null = null;

    for (const group of catalog.groups) {
      for (const entry of group.entries) {
        if (entry.name === mcpName) {
          foundConfig = entry.config;
          break;
        }
      }
      if (foundConfig) break;
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

    return withFileLock(PATHS.claudeJson, async () => {
      const claudeJson = (await readJsonFile<ClaudeJson>(PATHS.claudeJson)) ?? {};
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
