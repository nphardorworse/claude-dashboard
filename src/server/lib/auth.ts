import { randomBytes } from "crypto";
import { readFile, writeFile, mkdir } from "fs/promises";
import { join, dirname } from "path";
import { PATHS } from "./paths";
import type { Context, Next } from "hono";

const TOKEN_PATH = join(PATHS.claudeDir, "dashboard-token");
const TOKEN_BYTES = 32;

let cachedToken: string | null = null;

/**
 * Generate a random auth token on startup and persist it to disk.
 * If a token already exists from a previous run, reuse it.
 */
export const initToken = async (): Promise<string> => {
  try {
    const existing = (await readFile(TOKEN_PATH, "utf-8")).trim();
    if (existing.length >= 32) {
      cachedToken = existing;
      return cachedToken;
    }
  } catch {
    // File doesn't exist — generate a new one
  }

  const token = randomBytes(TOKEN_BYTES).toString("hex");
  await mkdir(dirname(TOKEN_PATH), { recursive: true });
  await writeFile(TOKEN_PATH, token, { mode: 0o600 });
  cachedToken = token;
  return cachedToken;
};

export const getToken = (): string => {
  if (!cachedToken) throw new Error("Token not initialized — call initToken() first");
  return cachedToken;
};

/**
 * Hono middleware: require `Authorization: Bearer <token>` on all
 * mutating routes (POST, PUT, DELETE).
 *
 * GET/HEAD/OPTIONS are intentionally unauthenticated because:
 * 1. The client needs to fetch the bootstrap token via GET /api/auth/token
 *    before it can authenticate — chicken-and-egg if GETs required auth.
 * 2. The primary threat model is unauthorized writes (config mutation),
 *    not reads. Read data (config, session summaries) is local-only.
 * 3. CORS restricts browser-origin reads to localhost:5175 anyway.
 *
 * If read-protection becomes needed, skip auth only for GET /api/auth/token
 * and GET /api/ping, then have the client use apiFetch for all requests.
 */
export const authMiddleware = async (c: Context, next: Next) => {
  const method = c.req.method;

  // Allow all GET/HEAD/OPTIONS (read-only + CORS preflight)
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") {
    return next();
  }

  // Allow the health-check POST from the MCP health scanner (internal)
  // and the ping endpoint
  const path = c.req.path;
  if (path === "/api/ping") {
    return next();
  }

  const authHeader = c.req.header("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return c.json({ error: "Authentication required" }, 401);
  }

  const token = authHeader.slice(7);
  if (token !== cachedToken) {
    return c.json({ error: "Invalid token" }, 403);
  }

  return next();
};
