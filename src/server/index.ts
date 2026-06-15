import { Hono } from "hono";
import { cors } from "hono/cors";
import { serve } from "@hono/node-server";
import { config } from "./routes/config";
import { health } from "./routes/health";
import { plugins } from "./routes/plugins";
import { skills } from "./routes/skills";
import { profiles } from "./routes/profiles";
import { hooks } from "./routes/hooks";
import { mcp } from "./routes/mcp";
import { projects } from "./routes/projects";
import { sessions } from "./routes/sessions";
import { defaults } from "./routes/defaults";
import { analytics } from "./routes/analytics";
import { usage } from "./routes/usage";
import { transcripts } from "./routes/transcripts";
import { initToken, getToken, authMiddleware } from "./lib/auth";
import { getAllSessions } from "./lib/session-scanner";

const app = new Hono();

app.use("/*", cors({ origin: "http://localhost:5175" }));
app.use("/api/*", authMiddleware);

app.get("/api/ping", (c) => c.json({ ok: true }));

// Bootstrap endpoint — returns the auth token to same-origin browser requests.
// Protected by CORS (only localhost:5175 origin allowed) so non-browser
// clients cannot fetch it without already knowing the token.
app.get("/api/auth/token", (c) => c.json({ token: getToken() }));

app.route("/api/config", config);
app.route("/api/health", health);
app.route("/api/plugins", plugins);
app.route("/api/skills", skills);
app.route("/api/profiles", profiles);
app.route("/api/hooks", hooks);
app.route("/api/mcp", mcp);
app.route("/api/projects", projects);
app.route("/api/sessions", sessions);
app.route("/api/defaults", defaults);
app.route("/api/analytics", analytics);
app.route("/api/usage", usage);
app.route("/api/transcripts", transcripts);

const PORT = 3847;
const MAX_BIND_RETRIES = 10;
const BIND_RETRY_DELAY_MS = 250;

const onListening = () => {
  console.info(
    `Claude Code Dashboard server running on http://localhost:${PORT}`,
  );
  console.info("Auth token: see ~/.claude/dashboard-token");
  console.info(`Token file: ~/.claude/dashboard-token`);

  // Prewarm the session cache so the first /usage request doesn't pay the
  // full cold scan of all transcripts (~5s on large histories). Fire-and-
  // forget — the server already accepts connections; any request arriving
  // mid-scan coalesces onto this one via getAllSessions' in-flight guard.
  const prewarmStart = performance.now();
  getAllSessions()
    .then((s) =>
      console.info(
        `Prewarmed session cache: ${s.length} sessions in ${Math.round(performance.now() - prewarmStart)}ms`,
      ),
    )
    .catch((err) =>
      console.warn(
        "Session cache prewarm failed (will lazy-load on first request):",
        err,
      ),
    );
};

// Bind with retry. `tsx watch` restarts the process on every server-file
// change, and the previous instance can still be releasing the port when the
// new one boots — a transient EADDRINUSE. Retry briefly before concluding that
// a *different* server genuinely owns the port (the only case worth aborting
// on). Exiting on the transient race is what left the dev server dead after a
// hot reload.
const listen = (attempt = 0): void => {
  const server = serve(
    { fetch: app.fetch, port: PORT, hostname: "127.0.0.1" },
    onListening,
  );

  server.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE" && attempt < MAX_BIND_RETRIES) {
      if (attempt === 0) {
        console.warn(
          `Port ${PORT} busy (previous instance still releasing it?) — retrying…`,
        );
      }
      setTimeout(() => listen(attempt + 1), BIND_RETRY_DELAY_MS);
      return;
    }

    if (err.code === "EADDRINUSE") {
      console.error(
        `\n✗ Port ${PORT} is still in use after ${MAX_BIND_RETRIES} retries — another dashboard server is likely running.\n` +
          `  Stop it, then re-run \`npm run dev\`:\n` +
          `      lsof -ti:${PORT} | xargs kill\n`,
      );
    } else {
      console.error("Dashboard server failed to start:", err);
    }
    process.exit(1);
  });
};

const start = async () => {
  await initToken();
  listen();
};

start();

export default app;
