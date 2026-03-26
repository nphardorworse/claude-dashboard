export type TokenLevel = "low" | "medium" | "high";

export type EnableSource = "global" | "project" | "default";
export type PluginEnableSource = EnableSource;

export type PluginInfo = {
  id: string;
  name: string;
  marketplace: string;
  description: string;
  enabled: boolean;
  enableSource: PluginEnableSource;
  version: string;
  installPath: string;
  lastUpdated: string;
  contentSizeBytes: number;
  estimatedTokens: number;
  baseEstimatedTokens: number;
  activeEstimatedTokens: number;
  tokenLevel: TokenLevel;
  hasAgents: boolean;
  hasSkills: boolean;
  hasMcp: boolean;
};

export type PluginsResponse = {
  plugins: PluginInfo[];
  activeCount: number;
  totalEstimatedTokens: number;
};

export type SkillSource = "user" | "plugin" | "project";

export type SkillInfo = {
  id: string;
  name: string;
  description: string;
  source: SkillSource;
  pluginId?: string;
  pluginName?: string;
  enabled: boolean;
  enableSource: EnableSource;
  parentPluginEnabled: boolean;
  installPath: string;
  contentSizeBytes: number;
  estimatedTokens: number;
  tokenLevel: TokenLevel;
};

export type SkillsResponse = {
  skills: SkillInfo[];
  activeCount: number;
  totalEstimatedTokens: number;
};

export type SkillToggleRequest = {
  skillId: string;
  enabled: boolean;
};

export type ToggleRequest = {
  pluginId: string;
  enabled: boolean;
};

export type BulkToggleRequest = {
  pluginIds: string[];
  enabled: boolean;
};

export type HealthWarning = {
  level: "info" | "warning" | "error";
  message: string;
  category: "cost" | "plugins" | "mcp" | "hooks";
};

export type TopPluginByCost = {
  name: string;
  estimatedTokens: number;
  tokenLevel: TokenLevel;
};

export type HealthSummary = {
  activePlugins: number;
  totalPlugins: number;
  activeMcpServers: number;
  hookEventCount: number;
  totalHookCommands: number;
  estimatedTokensPerTurn: number;
  tokenBudgetLevel: TokenLevel;
  activeProfile: string | null;
  contextWindowSize: number;
};

export type HealthResponse = {
  scope: string | null;
  summary: HealthSummary;
  warnings: HealthWarning[];
  topPluginsByCost: TopPluginByCost[];
};

export type ModelUsage = {
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  costUSD: number;
};

export type ProjectInfo = {
  path: string;
  name: string;
  lastCost: number | null;
  totalCostUSD: number | null;
  modelUsage: ModelUsage[];
  sessions: number;
  hasSettings: boolean;
  hasLocalSettings: boolean;
  hasMcpJson: boolean;
};

export type ProjectsResponse = {
  projects: ProjectInfo[];
};

export type SessionMeta = {
  sessionId: string;
  sessionName: string;
  projectPath: string;
  startTime: string;
  durationMinutes: number;
  userMessages: number;
  assistantMessages: number;
  toolCounts: Record<string, number>;
  inputTokens: number;
  outputTokens: number;
  firstPrompt: string;
  gitCommits: number;
  linesAdded: number;
  linesRemoved: number;
  filesModified: number;
  usesMcp: boolean;
  usesWebSearch: boolean;
  usesTaskAgent: boolean;
  toolErrors: number;
};

export type SessionsResponse = {
  sessions: SessionMeta[];
  totalTokens: number;
  totalSessions: number;
};

export type ProjectSettingsResponse = {
  projectPath: string;
  settings: Record<string, unknown> | null;
  localSettings: Record<string, unknown> | null;
  mcpServers: Record<string, unknown> | null;
  effectiveConfig: {
    permissions: { allow: string[] };
    hooks: Record<string, unknown[]>;
    enabledMcpServers: string[];
  };
};

// --- JSONL parser types ---

export type TurnUsage = {
  turnIndex: number;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  costUSD: number;
  totalContextSize: number;
  userPrompt: string;
  toolsUsed: string[];
  timestamp: string;
  durationMs: number;
  contextAtStart: number;
  toolOutputTokens: number;
};

export type SessionAnalysis = {
  sessionId: string;
  sessionName: string;
  projectPath: string;
  turns: TurnUsage[];
  totalCostUSD: number;
  cacheHitRate: number;
  contextGrowthRate: number;
  peakContextSize: number;
  systemPromptEstimate: number;
  modelBreakdown: Record<
    string,
    { inputTokens: number; outputTokens: number; costUSD: number }
  >;
};

// --- Usage types ---

export type ProjectUsage = {
  name: string;
  path: string;
  sessions: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCostUSD: number;
  percentage: number;
};

export type UsageResponse = {
  totalEstimatedCostUSD: number;
  totalSessions: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  pricingBasis: "sonnet";
  dataSource: "session-meta";
  projects: ProjectUsage[];
};

// --- Plan limits types ---

export type PlanLimits = {
  sessionMessageLimit: number | null;  // messages (API calls) per 5hr window (~225 for Max 5x)
  weeklyMessageLimit: number | null;   // messages per weekly window
  sessionResetsAt: string | null;      // time-of-day "HH:MM" — auto-advances to next occurrence
  weeklyResetsAt: string | null;       // ISO timestamp — auto-advances by 7 days when past
};

export type WindowedProjectUsage = {
  name: string;
  path: string;
  messages: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCostUSD: number;
  sessions: number;
};

export type UsageWindow = {
  totalMessages: number;               // primary metric — API calls (rate-limited)
  messageLimit: number | null;
  messagePercentage: number | null;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalTokens: number;
  totalEstimatedCostUSD: number;
  totalSessions: number;
  resetsInMs: number;                  // ms until window resets (0 if unknown)
  projects: WindowedProjectUsage[];
};

export type WindowedUsageResponse = {
  session: UsageWindow;
  weekly: UsageWindow;
  limits: PlanLimits;
  pricingBasis: "sonnet";
};

// --- Insights types ---

export type Insight = {
  id: string;
  level: "info" | "warning" | "tip";
  title: string;
  message: string;
  category: "context" | "cache" | "model" | "session" | "plugins";
};

// --- Hook types (shared for profiles) ---

export type HookCommand = {
  type: string;
  command: string;
  timeout?: number;
};

export type HookEntry = {
  matcher: string;
  hooks: HookCommand[];
};

export type HooksMap = Record<string, HookEntry[]>;

// --- Profile types ---

export type ProfileEntry = {
  name: string;
  description: string;
  pluginCount: number;
  skillCount: number;
  hookEventCount: number;
  mcpServerCount: number;
  plugins: Record<string, boolean>;
  skills: Record<string, boolean>;
  hooks: HooksMap;
  enabledMcpServers: string[];
  disabledMcpServers: string[];
  isActive: boolean;
};

// --- MCP Catalog types ---

export type ContextWindowResponse = {
  detected: number | null;
  override: number | null;
  effective: number;
};

export type McpOrigin = "global" | "global-disabled" | "plugin" | "project" | "personal" | "cloud";

export type ProjectMcpStatus = "active" | "disabled" | "available";

export type McpServerConfig = {
  command?: string;
  url?: string;
  args?: string[];
  env?: Record<string, string>;
  type?: string;
};

export type McpCatalogEntry = {
  name: string;
  origin: McpOrigin;
  pluginName?: string;
  pluginNames?: string[];
  sourceProject?: string;
  config: McpServerConfig;
  health: "connected" | "needs_auth" | "failed" | "unknown";
  isPinned: boolean;
  projectStatus?: ProjectMcpStatus;
};

export type McpCatalogGroup = {
  label: string;
  origin: McpOrigin;
  pluginName?: string;
  entries: McpCatalogEntry[];
};

export type CatalogResponse = {
  scope: "global" | "project";
  groups: McpCatalogGroup[];
  active?: McpCatalogGroup[];
  disabled?: McpCatalogGroup[];
  available?: McpCatalogGroup[];
  totalCount: number;
  connectedCount: number;
};
