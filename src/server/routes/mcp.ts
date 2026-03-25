import { Hono } from "hono";
import { PATHS, getProjectPath, getMcpJsonPath } from "../lib/paths";
import { readJsonFile, writeJsonFile, ensureDir } from "../lib/file-io";
import { checkMcpHealth } from "../lib/mcp-health";
import { withFileLock } from "../lib/file-lock";
import { PINNED_MCPS } from "../../shared/mcp-pinned";
import { dirname } from "path";
import type { McpServerHealth } from "../lib/mcp-health";
import type { ClaudeJson, McpServerConfig, ProjectEntry } from "../lib/types";

type McpServerInfo = {
  name: string;
  command: string;
  args: string[];
  env: Record<string, string>;
  type: string;
  status: McpServerHealth["status"];
  source: "global" | "project-file" | "project-settings";
};

type AddServerRequest = {
  name: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
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

// Read per-project MCP servers stored inside ~/.claude.json → projects[path].mcpServers
const readProjectMcpFromClaudeJson = async (
  projectPath: string
): Promise<Record<string, McpServerConfig>> => {
  const claudeJson = await readJsonFile<ClaudeJson>(PATHS.claudeJson);
  const projectEntry = claudeJson?.projects?.[projectPath];
  return projectEntry?.mcpServers ?? {};
};

// Collect disabled MCP server names from ~/.claude.json project entries (excludes pinned)
const getDisabledServers = async (projectPath?: string): Promise<string[]> => {
  const claudeJson = await readJsonFile<ClaudeJson>(PATHS.claudeJson);
  const projects = (claudeJson?.projects ?? {}) as Record<string, ProjectEntry>;

  if (projectPath) {
    // Single project
    const entry = projects[projectPath];
    if (!entry) return [];
    return [
      ...(entry.disabledMcpServers ?? []),
      ...(entry.disabledMcpjsonServers ?? []),
    ].filter((n) => !PINNED_MCPS.has(n));
  }

  // Global: aggregate all disabled MCPs across all projects (deduplicated, excluding pinned)
  const disabled = new Set<string>();
  for (const entry of Object.values(projects)) {
    for (const name of entry.disabledMcpServers ?? []) disabled.add(name);
    for (const name of entry.disabledMcpjsonServers ?? []) disabled.add(name);
  }
  for (const pinned of PINNED_MCPS) disabled.delete(pinned);
  return Array.from(disabled).sort();
};

const mcp = new Hono();

// GET /servers — list all MCP servers with health status + disabled list
mcp.get("/servers", async (c) => {
  try {
    const projectPath = await getProjectPath(c);
    const healthResults = await checkMcpHealth();
    const disabledServers = await getDisabledServers(projectPath);

    if (!projectPath) {
      // Global: merge MCPs from ~/.claude.json config + health check (plugins/cloud MCPs)
      const data = await readJsonFile<ClaudeJson>(PATHS.claudeJson);
      const mcpServers = data?.mcpServers ?? {};
      const configServers = buildServerList(mcpServers, healthResults, "global");

      // Health check discovers plugin/cloud MCPs not in ~/.claude.json
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
      // Filter out disabled names that are currently active (already shown above)
      const activeNames = new Set(servers.map((s) => s.name));
      const inactiveServers = disabledServers.filter((name) => !activeNames.has(name));
      return c.json({ servers, connectedCount, disabledServers: inactiveServers, scope: "global" });
    }

    // Project scope: merge servers from .mcp.json AND ~/.claude.json projects[path].mcpServers
    const mcpJsonPath = getMcpJsonPath(projectPath);
    const mcpJsonData = await readJsonFile<ClaudeJson>(mcpJsonPath);
    const fileServers = mcpJsonData?.mcpServers ?? {};

    const settingsServers = await readProjectMcpFromClaudeJson(projectPath);

    const fromFile = buildServerList(fileServers, healthResults, "project-file");
    const fromSettings = buildServerList(settingsServers, healthResults, "project-settings");

    // Merge, dedup by name (file takes precedence)
    const seen = new Set(fromFile.map((s) => s.name));
    const merged = [...fromFile, ...fromSettings.filter((s) => !seen.has(s.name))];

    const connectedCount = merged.filter((s) => s.status === "connected").length;
    const activeNames = new Set(merged.map((s) => s.name));
    const inactiveServers = disabledServers.filter((name) => !activeNames.has(name));

    // All known MCP names: config + health check (plugins/cloud MCPs aren't in mcpServers)
    const globalData = await readJsonFile<ClaudeJson>(PATHS.claudeJson);
    const configNames = Object.keys(globalData?.mcpServers ?? {});
    const healthNames = healthResults.map((h) => h.name);
    const globalServerNames = [...new Set([...configNames, ...healthNames])].sort();
    const projectEntry = (globalData?.projects ?? {})[projectPath] as ProjectEntry | undefined;
    const projectDisabledMcps = projectEntry?.disabledMcpServers ?? [];

    return c.json({ servers: merged, connectedCount, disabledServers: inactiveServers, globalServerNames, projectDisabledMcps, scope: "project" });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return c.json({ error: message }, 500);
  }
});

// POST /servers — add a new MCP server
mcp.post("/servers", async (c) => {
  try {
    const body = (await c.req.json()) as AddServerRequest;
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

// PUT /project-disabled — set disabled MCPs for a specific project
mcp.put("/project-disabled", async (c) => {
  try {
    const { projectPath, servers } = await c.req.json<{ projectPath: string; servers: string[] }>();
    if (!projectPath || typeof projectPath !== "string") {
      return c.json({ error: "projectPath required" }, 400);
    }
    if (!Array.isArray(servers)) {
      return c.json({ error: "servers array required" }, 400);
    }

    return withFileLock(PATHS.claudeJson, async () => {
      const claudeJson = (await readJsonFile<ClaudeJson>(PATHS.claudeJson)) ?? {};
      const projects = claudeJson.projects ?? {};
      const projectEntry = projects[projectPath] ?? {};

      (projectEntry as ProjectEntry).disabledMcpServers = servers.filter((n) => !PINNED_MCPS.has(n));

      projects[projectPath] = projectEntry;
      claudeJson.projects = projects;
      await writeJsonFile(PATHS.claudeJson, claudeJson);

      return c.json({ ok: true, disabled: servers.length });
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return c.json({ error: message }, 500);
  }
});

// PUT /bulk-reenable — remove server names from disabled lists across all projects
mcp.put("/bulk-reenable", async (c) => {
  try {
    const { servers } = await c.req.json<{ servers: string[] }>();
    if (!Array.isArray(servers) || servers.length === 0) {
      return c.json({ error: "servers array required" }, 400);
    }

    // Skip pinned MCPs — they should never be in disabled lists
    const toRemove = new Set(servers.filter((n) => !PINNED_MCPS.has(n)));
    if (toRemove.size === 0) {
      return c.json({ ok: true, projectsUpdated: 0 });
    }

    return withFileLock(PATHS.claudeJson, async () => {
      const claudeJson = (await readJsonFile<ClaudeJson>(PATHS.claudeJson)) ?? {};
      const projects = (claudeJson.projects ?? {}) as Record<string, ProjectEntry>;

      let updated = 0;
      for (const entry of Object.values(projects)) {
        if (entry.disabledMcpServers) {
          const before = entry.disabledMcpServers.length;
          entry.disabledMcpServers = entry.disabledMcpServers.filter((n) => !toRemove.has(n));
          if (entry.disabledMcpServers.length < before) updated++;
        }
        if (entry.disabledMcpjsonServers) {
          entry.disabledMcpjsonServers = entry.disabledMcpjsonServers.filter((n) => !toRemove.has(n));
        }
      }

      claudeJson.projects = projects;
      await writeJsonFile(PATHS.claudeJson, claudeJson);

      return c.json({ ok: true, projectsUpdated: updated });
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
