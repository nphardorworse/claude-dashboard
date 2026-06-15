import { defineConfig, createLogger } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import type { ServerResponse } from "http";

// The /api proxy targets the dev API server (tsx watch). During a server
// restart or the startup race it's briefly unreachable; the client retries
// those requests (see src/client/lib/net.ts), so Vite's multi-line
// "http proxy error" stack traces are just noise. Drop them; keep all else.
const logger = createLogger();
const baseError = logger.error;
logger.error = (msg, options) => {
  if (typeof msg === "string" && msg.includes("http proxy error")) return;
  baseError(msg, options);
};

export default defineConfig({
  plugins: [react(), tailwindcss()],
  customLogger: logger,
  resolve: {
    alias: {
      "~": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 5175,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:3847",
        // When the API server is momentarily down, answer with a clean,
        // retryable 503 instead of hanging the socket. net.ts retries on 503.
        configure(proxy) {
          proxy.on("error", (_err, _req, res) => {
            const httpRes = res as ServerResponse;
            if (typeof httpRes?.writeHead === "function" && !httpRes.headersSent) {
              httpRes.writeHead(503, { "Content-Type": "application/json" });
              httpRes.end(
                JSON.stringify({ error: "Dashboard server unavailable, retrying" }),
              );
            }
          });
        },
      },
    },
  },
});
