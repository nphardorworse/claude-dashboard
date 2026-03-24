import { execFileSync } from "child_process";

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

export const checkMcpHealth = (): McpServerHealth[] => {
  try {
    const output = execFileSync("claude", ["mcp", "list"], {
      timeout: 15_000,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });

    const lines = output.split("\n").filter((l) => l.trim().length > 0);
    const results: McpServerHealth[] = [];

    for (const line of lines) {
      const parsed = parseLine(line);
      if (parsed) {
        results.push(parsed);
      }
    }

    return results;
  } catch {
    return [];
  }
};
