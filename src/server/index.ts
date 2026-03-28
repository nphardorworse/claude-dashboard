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
import { initToken, getToken, authMiddleware } from "./lib/auth";

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

const PORT = 3847;

const start = async () => {
  const token = await initToken();

  serve({ fetch: app.fetch, port: PORT, hostname: "127.0.0.1" }, () => {
    console.info(
      `Claude Code Dashboard server running on http://localhost:${PORT}`,
    );
    console.info("Auth token: see ~/.claude/dashboard-token");
    console.info(`Token file: ~/.claude/dashboard-token`);
  });
};

start();

export default app;
