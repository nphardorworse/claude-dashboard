import { Hono } from "hono";
import { PATHS } from "../lib/paths";
import { readJsonFile, writeJsonFile } from "../lib/file-io";
import { withFileLock } from "../lib/file-lock";
import { detectContextWindowFromSessions, DEFAULT_CONTEXT_WINDOW } from "../lib/cost-estimator";
import { getAllSessions } from "../lib/session-scanner";
import type { PlanLimits, ContextWindowResponse } from "../../shared/types";

type DashboardConfig = {
  defaultProfile?: string;
  planLimits?: PlanLimits;
  contextWindowSize?: number | null;
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

    if (profileName !== null && profileName !== undefined) {
      if (typeof profileName !== "string" || !/^[a-zA-Z0-9_-]+$/.test(profileName)) {
        return c.json({ error: "Invalid profile name" }, 400);
      }
    }

    return await withFileLock(PATHS.dashboardConfig, async () => {
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

    return await withFileLock(PATHS.dashboardConfig, async () => {
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

// GET /context-window — detect or read context window setting
defaults.get("/context-window", async (c) => {
  try {
    const config = await readConfig();
    const override = config.contextWindowSize ?? null;

    let detected: number | null = null;
    try {
      const sessions = await getAllSessions();
      detected = detectContextWindowFromSessions(sessions);
    } catch {
      // Session scan failed
    }

    const effective = override ?? detected ?? DEFAULT_CONTEXT_WINDOW;
    const response: ContextWindowResponse = { detected, override, effective };
    return c.json(response);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return c.json({ error: message }, 500);
  }
});

// PUT /context-window — save manual override (null clears it)
defaults.put("/context-window", async (c) => {
  try {
    const { contextWindowSize } = await c.req.json<{ contextWindowSize: number | null }>();

    if (contextWindowSize !== null && contextWindowSize !== undefined) {
      if (typeof contextWindowSize !== "number" || !Number.isFinite(contextWindowSize) || contextWindowSize <= 0 || contextWindowSize > 2_000_000) {
        return c.json({ error: "contextWindowSize must be a positive number up to 2,000,000 or null" }, 400);
      }
    }

    return await withFileLock(PATHS.dashboardConfig, async () => {
      const config = await readConfig();
      config.contextWindowSize = contextWindowSize ?? undefined;
      await writeJsonFile(PATHS.dashboardConfig, config);
      return c.json({ ok: true });
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return c.json({ error: message }, 500);
  }
});

export { defaults };
