import { Hono } from "hono";
import { PATHS } from "../lib/paths";
import { readJsonFile, writeJsonFile } from "../lib/file-io";
import { withFileLock } from "../lib/file-lock";
import type { PlanLimits } from "../../shared/types";

type DashboardConfig = {
  defaultProfile?: string;
  planLimits?: PlanLimits;
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
      defaultProfile: config.defaultProfile ?? null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return c.json({ error: message }, 500);
  }
});

// PUT /profile — set default profile for new projects
defaults.put("/profile", async (c) => {
  try {
    const { profileName } = await c.req.json<{ profileName: string | null }>();

    return withFileLock(PATHS.dashboardConfig, async () => {
      const config = await readConfig();
      config.defaultProfile = profileName ?? undefined;
      await writeJsonFile(PATHS.dashboardConfig, config);
      return c.json({ ok: true });
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
      sessionMessageLimit: null,
      weeklyMessageLimit: null,
      sessionResetsAt: null,
      weeklyResetsAt: null,
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

    return withFileLock(PATHS.dashboardConfig, async () => {
      const config = await readConfig();
      config.planLimits = {
        sessionMessageLimit: body.sessionMessageLimit ?? null,
        weeklyMessageLimit: body.weeklyMessageLimit ?? null,
        sessionResetsAt: body.sessionResetsAt ?? null,
        weeklyResetsAt: body.weeklyResetsAt ?? null,
      };
      await writeJsonFile(PATHS.dashboardConfig, config);
      return c.json({ ok: true });
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return c.json({ error: message }, 500);
  }
});

export { defaults };
