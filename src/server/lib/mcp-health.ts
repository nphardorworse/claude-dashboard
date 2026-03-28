import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

export type McpServerHealth = {
  name: string;
  command: string;
  status: "connected" | "needs_auth" | "failed" | "unknown";
};

const parseStatus = (indicator: string): McpServerHealth["status"] => {
  if (indicator.includes("\u2713")) return "connected";
  if (indicator.includes("!")) return "needs_auth";
  if (indicator.includes("\u2717")) return "failed";
  return "unknown";
};

const parseLine = (line: string): McpServerHealth | null => {
  // Format: "name: command/url - <status indicator> Status text"
  // Examples:
  //   plugin:context7:context7: npx -y @upstash/context7-mcp - ✓ Connected
  //   second-brain: /opt/homebrew/bin/python3.11 /Users/.../server.py - ✓ Connected
  //   pubmed: https://pubmed.mcp.claude.com/mcp (HTTP) - ! Needs authentication
  //   paper: http://127.0.0.1:29979/mcp (HTTP) - ✗ Failed to connect
  const dashStatusMatch = line.match(
    /^(.+?):\s+(.+?)\s+-\s+([✓!✗])\s+(.+)$/
  );
  if (!dashStatusMatch) return null;

  const [, name, command, indicator] = dashStatusMatch;
  return {
    name: name.trim(),
    command: command.trim(),
    status: parseStatus(indicator),
  };
};

let healthCache: McpServerHealth[] | null = null;
let healthCacheTime = 0;
const HEALTH_TTL_MS = 30_000;

export const checkMcpHealth = async (bypassCache = false): Promise<McpServerHealth[]> => {
  const now = Date.now();
  if (!bypassCache && healthCache !== null && now - healthCacheTime < HEALTH_TTL_MS) {
    return healthCache;
  }

  try {
    const { stdout } = await execFileAsync("claude", ["mcp", "list"], {
      timeout: 15_000,
    });

    const lines = stdout.split("\n").filter((l) => l.trim().length > 0);
    const results: McpServerHealth[] = [];

    for (const line of lines) {
      const parsed = parseLine(line);
      if (parsed) {
        results.push(parsed);
      }
    }

    healthCache = results;
    healthCacheTime = now;
    return results;
  } catch (err) {
    console.error("[mcp-health] Health check failed:", err);
    return healthCache ?? [];
  }
};
