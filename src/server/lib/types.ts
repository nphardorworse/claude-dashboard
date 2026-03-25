/** Shape of ~/.claude.json — used by mcp.ts and defaults.ts */
import type { McpServerConfig } from "../../shared/types";

export type { McpServerConfig };

export type ProjectEntry = {
  mcpServers?: Record<string, McpServerConfig>;
  disabledMcpServers?: string[];
  disabledMcpjsonServers?: string[];
  enabledMcpjsonServers?: string[];
  [k: string]: unknown;
};

export type ClaudeJson = {
  mcpServers?: Record<string, McpServerConfig>;
  disabledMcpServers?: Record<string, McpServerConfig>;
  projects?: Record<string, ProjectEntry>;
  [key: string]: unknown;
};
