import { Hono } from "hono";
import { getProjectPath } from "../lib/paths";
import {
  getAllSessions,
  getSessionsForProject,
} from "../lib/session-scanner";
import type { SessionMeta } from "../lib/session-scanner";

type SessionsResponse = {
  sessions: SessionMeta[];
  totalTokens: number;
  totalSessions: number;
};

const buildResponse = (sessions: SessionMeta[]): SessionsResponse => {
  const sorted = [...sessions].sort(
    (a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime()
  );

  const totalTokens = sorted.reduce(
    (sum, s) => sum + s.inputTokens + s.outputTokens,
    0
  );

  return {
    sessions: sorted,
    totalTokens,
    totalSessions: sorted.length,
  };
};

const sessions = new Hono();

sessions.get("/", async (c) => {
  try {
    const projectPath = await getProjectPath(c);

    const raw = projectPath
      ? await getSessionsForProject(projectPath)
      : await getAllSessions();

    return c.json(buildResponse(raw));
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return c.json({ error: message }, 500);
  }
});

export { sessions };
