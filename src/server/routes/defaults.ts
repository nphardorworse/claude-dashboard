import { Hono } from "hono";
import { PATHS } from "../lib/paths";
import { readJsonFile, writeJsonFile } from "../lib/file-io";
import type { PlanLimits } from "../../shared/types";

type DashboardConfig = {
  defaultDisabledMcpServers?: string[];
  defaultProfile?: string;
  planLimits?: PlanLimits;
  [key: string]: unknown;
};

type ClaudeJson = {
  projects?: Record<string, {
    disabledMcpServers?: string[];
    [key: string]: unknown;
  }>;
  [key: string]: unknown;
};

const readConfig = async (): Promise<DashboardConfig> => {
  return (await readJsonFile<DashboardConfig>(PATHS.dashboardConfig)) ?? {};
};

const defaults = new Hono();

// GET / — read default settings
defaults.get("/", async (c) => {
  try {
    const config = await readConfig();
    return c.json({
      defaultDisabledMcpServers: config.defaultDisabledMcpServers ?? [],
      defaultProfile: config.defaultProfile ?? null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return c.json({ error: message }, 500);
  }
});

// PUT /disabled-mcps — set default disabled MCP servers
defaults.put("/disabled-mcps", async (c) => {
  try {
    const { servers } = await c.req.json<{ servers: string[] }>();
    if (!Array.isArray(servers)) {
      return c.json({ error: "servers array required" }, 400);
    }

    const config = await readConfig();
    config.defaultDisabledMcpServers = servers;
    await writeJsonFile(PATHS.dashboardConfig, config);

    return c.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return c.json({ error: message }, 500);
  }
});

// PUT /profile — set default profile for new projects
defaults.put("/profile", async (c) => {
  try {
    const { profileName } = await c.req.json<{ profileName: string | null }>();

    const config = await readConfig();
    config.defaultProfile = profileName ?? undefined;
    await writeJsonFile(PATHS.dashboardConfig, config);

    return c.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return c.json({ error: message }, 500);
  }
});

// POST /apply — apply defaults to a specific project
defaults.post("/apply", async (c) => {
  try {
    const { projectPath } = await c.req.json<{ projectPath: string }>();
    if (!projectPath) {
      return c.json({ error: "projectPath required" }, 400);
    }

    const config = await readConfig();
    const disabledMcps = config.defaultDisabledMcpServers ?? [];

    if (disabledMcps.length === 0) {
      return c.json({ ok: true, applied: { disabledMcpServers: 0 } });
    }

    // Write disabled MCPs to the project entry in ~/.claude.json
    const claudeJson = (await readJsonFile<ClaudeJson>(PATHS.claudeJson)) ?? {};
    const projects = claudeJson.projects ?? {};
    const projectEntry = projects[projectPath] ?? {};

    // Merge with any existing disabled servers
    const existing = new Set(projectEntry.disabledMcpServers ?? []);
    for (const name of disabledMcps) {
      existing.add(name);
    }
    projectEntry.disabledMcpServers = Array.from(existing);

    projects[projectPath] = projectEntry;
    claudeJson.projects = projects;
    await writeJsonFile(PATHS.claudeJson, claudeJson);

    return c.json({
      ok: true,
      applied: { disabledMcpServers: disabledMcps.length },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return c.json({ error: message }, 500);
  }
});

// GET /plan-limits — read configured plan limits
defaults.get("/plan-limits", async (c) => {
  try {
    const config = await readConfig();
    const limits = config.planLimits ?? {
      sessionTokenLimit: null,
      weeklyTokenLimit: null,
    };
    return c.json(limits);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return c.json({ error: message }, 500);
  }
});

// PUT /plan-limits — save configured plan limits
defaults.put("/plan-limits", async (c) => {
  try {
    const body = await c.req.json<PlanLimits>();
    const config = await readConfig();
    config.planLimits = {
      sessionTokenLimit: body.sessionTokenLimit ?? null,
      weeklyTokenLimit: body.weeklyTokenLimit ?? null,
    };
    await writeJsonFile(PATHS.dashboardConfig, config);
    return c.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return c.json({ error: message }, 500);
  }
});

export { defaults };
