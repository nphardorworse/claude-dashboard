import { type ReactNode, useState, useCallback } from "react";
import { PageShell } from "../layout/PageShell";
import { LevelToggle } from "./LevelToggle";
import { SectionBlock } from "./SectionBlock";
import { EcosystemDiagram } from "./EcosystemDiagram";
import { ConceptCard } from "./ConceptCard";
import { ConfigDiagram } from "./ConfigDiagram";
import { DependencyCascade } from "./DependencyCascade";
import { DisclaimerCard } from "./DisclaimerCard";
import { WalkthroughGrid } from "./WalkthroughGrid";
import { QuickStartSteps } from "./QuickStartSteps";
import {
  PluginsIcon,
  SkillsIcon,
  McpIcon,
  HooksIcon,
  ProfilesIcon,
} from "../shared/NavIcons";

type Level = "beginner" | "advanced";

// ---------------------------------------------------------------------------
// Concept card data
// ---------------------------------------------------------------------------

type ConceptItem = { icon: ReactNode; title: string; description: string };

const BEGINNER_CONCEPTS: ConceptItem[] = [
  {
    icon: <PluginsIcon />,
    title: "Plugin",
    description:
      "A plugin is like a browser extension for Claude Code. It adds new capabilities \u2014 code review, test-driven development, design skills, etc. Each plugin is a directory containing instructions, skills, and optionally MCP server configs. You can enable/disable plugins globally or per-project.",
  },
  {
    icon: <SkillsIcon />,
    title: "Skill",
    description:
      'A skill is a specific capability provided by a plugin \u2014 like "code review", "write tests", or "create a PR". You invoke skills with slash commands (e.g., /commit). You can disable individual skills without disabling the whole plugin.',
  },
  {
    icon: <McpIcon />,
    title: "MCP Server",
    description:
      "MCP (Model Context Protocol) servers give Claude access to external tools and data \u2014 a knowledge base, a documentation service, a web search API, etc. Some come bundled with plugins, others you add manually. They can be global (available everywhere) or project-specific.",
  },
  {
    icon: <HooksIcon />,
    title: "Hook",
    description:
      'Hooks are shell commands that run automatically when certain events happen \u2014 like before a tool is used, after a message is sent, or when a session starts. They\'re useful for enforcing rules (e.g., "always run linting before committing").',
  },
  {
    icon: <ProfilesIcon />,
    title: "Profile",
    description:
      'A profile is a saved set of enabled plugins \u2014 like a preset. Instead of toggling 20 plugins one by one, you switch to a profile and all the right plugins activate. The dashboard comes with presets like "core" (minimal), "mobile" (React Native focused), "web", and "full".',
  },
];

const ADVANCED_CONCEPTS: ConceptItem[] = [
  {
    icon: <PluginsIcon />,
    title: "Plugin",
    description:
      "Directories in ~/.claude/plugins/cache/ scanned from installed_plugins.json. Each contains skill definitions (.md files), optional .mcp.json, and metadata. Resolution: project enabledPlugins > global enabledPlugins > default (enabled). Disabling a plugin disables all its skills and bundled MCPs.",
  },
  {
    icon: <SkillsIcon />,
    title: "Skill",
    description:
      "Markdown files within plugin directories that define specialized prompts and tool-use patterns. Registered via frontmatter (name, description). Invoked via the Skill tool or slash commands. Can be toggled independently in settings.json under disabledSkills.",
  },
  {
    icon: <McpIcon />,
    title: "MCP Server",
    description:
      "Stdio or HTTP servers implementing the MCP protocol. Six source origins: global (~/.claude.json), global-disabled (disabledMcpServers), plugin (.mcp.json in plugin dirs), project (<project>/.mcp.json), personal (projects[path].mcpServers), cloud (Anthropic-hosted, runtime only). The dashboard aggregates all sources into a unified catalog.",
  },
  {
    icon: <HooksIcon />,
    title: "Hook",
    description:
      "Shell commands in settings.json keyed by event type (PreToolUse, PostToolUse, SessionStart, etc.). Optional matcher field filters by tool name. Execute synchronously in the Claude Code process. Independent of plugins \u2014 they don't belong to any plugin and aren't affected by plugin toggles.",
  },
  {
    icon: <ProfilesIcon />,
    title: "Profile",
    description:
      "JSON files in ~/.claude/profiles/ containing { enabledPlugins: string[] }. Switching a profile overwrites the global enabledPlugins list in settings.json. All skills and bundled MCPs of the enabled plugins become active. CLI shortcut: claude-profile <name>.",
  },
];

// ---------------------------------------------------------------------------
// Config file map (advanced only)
// ---------------------------------------------------------------------------

type FileMapRow = { what: string; file: string; scope: string };

const FILE_MAP_ROWS: FileMapRow[] = [
  { what: "Global settings", file: "~/.claude/settings.json", scope: "User" },
  {
    what: "Global MCP servers",
    file: "~/.claude.json",
    scope: "User",
  },
  {
    what: "Installed plugins list",
    file: "~/.claude/plugins/installed_plugins.json",
    scope: "User",
  },
  {
    what: "Plugin cache",
    file: "~/.claude/plugins/cache/<plugin>/",
    scope: "User",
  },
  { what: "Profiles", file: "~/.claude/profiles/<name>.json", scope: "User" },
  {
    what: "Project settings",
    file: "<project>/.claude/settings.json",
    scope: "Project",
  },
  {
    what: "Project MCP servers",
    file: "<project>/.mcp.json",
    scope: "Project",
  },
  {
    what: "Personal project MCP",
    file: "~/.claude.json > projects[path].mcpServers",
    scope: "Personal",
  },
  {
    what: "CLAUDE.md (global)",
    file: "~/.claude/CLAUDE.md",
    scope: "User",
  },
  {
    what: "CLAUDE.md (project)",
    file: "<project>/CLAUDE.md",
    scope: "Project",
  },
  {
    what: "Session logs",
    file: "~/.claude/projects/*/sessions/",
    scope: "Local",
  },
];

const fileMapRows = FILE_MAP_ROWS.map((row) => (
  <tr key={row.file}>
    <td className="py-1.5 pr-4 text-zinc-100">{row.what}</td>
    <td className="py-1.5 pr-4 font-mono text-zinc-400">{row.file}</td>
    <td className="py-1.5 text-zinc-500">{row.scope}</td>
  </tr>
));

const FileMapTable = () => (
  <div className="mt-4 overflow-x-auto">
    <table className="w-full text-[12px]">
      <thead>
        <tr className="text-left text-zinc-500 border-b border-[var(--border-hairline)]">
          <th className="pb-2 pr-4 font-medium">What</th>
          <th className="pb-2 pr-4 font-medium">File</th>
          <th className="pb-2 font-medium">Scope</th>
        </tr>
      </thead>
      <tbody>{fileMapRows}</tbody>
    </table>
  </div>
);

// ---------------------------------------------------------------------------
// Concept grid
// ---------------------------------------------------------------------------

const ConceptGrid = ({ level }: { level: Level }) => {
  const items = level === "beginner" ? BEGINNER_CONCEPTS : ADVANCED_CONCEPTS;
  const cards = items.map((item) => (
    <ConceptCard
      key={item.title}
      icon={item.icon}
      title={item.title}
      description={item.description}
    />
  ));

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {cards}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Text sections
// ---------------------------------------------------------------------------

const ProblemSection = ({ level }: { level: Level }) => {
  if (level === "beginner") {
    return (
      <div className="text-[13px] text-zinc-400 leading-relaxed space-y-3">
        <p>
          Claude Code is powerful out of the box, but as you add plugins, MCP
          servers, custom skills, and hooks, things get complicated fast. You end
          up with 60+ plugins, multiple config files, and no clear picture of
          what's active, what it costs, or how it all fits together.
        </p>
        <p>
          This dashboard gives you visibility and control. Instead of editing
          JSON files by hand and guessing at token costs, you get a single UI
          that shows everything, lets you toggle things on and off, and helps you
          understand the tradeoffs.
        </p>
      </div>
    );
  }

  return (
    <div className="text-[13px] text-zinc-400 leading-relaxed space-y-3">
      <p>
        Claude Code's configuration is spread across 6+ file locations with a
        complex resolution order (project overrides global, personal overrides
        project for MCP, etc.). Plugins bring bundled MCPs and skills with
        implicit dependencies. There's no built-in way to see aggregate token
        cost, detect conflicts, or understand the full dependency graph.
      </p>
      <p>
        This dashboard aggregates all sources, computes a unified view, and
        surfaces health metrics, warnings, and cost estimates that would
        otherwise require manual inspection of multiple config files and session
        logs.
      </p>
    </div>
  );
};

const TokenEconomicsSection = ({ level }: { level: Level }) => {
  if (level === "beginner") {
    return (
      <div className="text-[13px] text-zinc-400 leading-relaxed space-y-4">
        <div>
          <h3 className="text-zinc-100 font-semibold mb-1">
            What Are Tokens?
          </h3>
          <p>
            Every time Claude reads your instructions, plugins, skills, and MCP
            tool definitions, it consumes "tokens" (roughly 3.5 characters = 1
            token). More plugins = more tokens per message = higher cost and
            slower responses. The dashboard estimates how many tokens your
            current setup adds to every conversation turn.
          </p>
        </div>
        <div>
          <h3 className="text-zinc-100 font-semibold mb-1">
            How the Dashboard Estimates Cost
          </h3>
          <ol className="list-decimal list-inside space-y-1.5 ml-1">
            <li>
              It reads all enabled plugin instructions, skill definitions, and
              MCP tool schemas.
            </li>
            <li>
              It estimates the token count for each using character-based
              approximation (~3.5 chars/token).
            </li>
            <li>
              It sums them up to show your estimated tokens per turn, with
              per-plugin breakdowns.
            </li>
          </ol>
        </div>
        <div>
          <h3 className="text-zinc-100 font-semibold mb-1">Why It Matters</h3>
          <p>
            On Claude Max or Pro plans, you have a limited number of messages per
            session and per week. Every token in your system prompt eats into
            those limits. If your setup adds 50k tokens per turn, you'll hit
            limits much faster than someone with 10k tokens per turn. The
            dashboard helps you find the right balance.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="text-[13px] text-zinc-400 leading-relaxed space-y-4">
      <div>
        <h3 className="text-zinc-100 font-semibold mb-1">What Are Tokens?</h3>
        <p>
          Context window consumption per turn. Each enabled plugin injects its
          CLAUDE.md instructions + skill definitions + MCP tool JSON schemas
          into the system prompt. Token estimation uses a ~3.5 chars/token
          heuristic applied to raw file content. Actual tokenization varies by
          model but the approximation is sufficient for relative comparison.
        </p>
      </div>
      <div>
        <h3 className="text-zinc-100 font-semibold mb-1">
          How the Dashboard Estimates Cost
        </h3>
        <ol className="list-decimal list-inside space-y-1.5 ml-1">
          <li>
            Scans all enabled plugin directories for .md files (skills) and
            .mcp.json (tool definitions).
          </li>
          <li>
            Sums character counts, applies the 3.5:1 ratio, and adds baseline
            overhead (~2k tokens for Claude Code's own system prompt).
          </li>
          <li>
            Reports per-plugin, per-skill, and per-MCP-server token estimates
            with aggregate totals.
          </li>
        </ol>
      </div>
      <div>
        <h3 className="text-zinc-100 font-semibold mb-1">Why It Matters</h3>
        <p>
          Higher context consumption = fewer effective messages per session
          (larger request payload = higher billing weight). On subscription
          plans, this translates to hitting rate limits faster. The
          tokens-per-turn metric is the single best proxy for "how expensive is
          my setup." Target: under 30k/turn for balanced setups, under 15k/turn
          for lean setups.
        </p>
      </div>
    </div>
  );
};

const InsightsSection = ({ level }: { level: Level }) => {
  if (level === "beginner") {
    return (
      <div className="text-[13px] text-zinc-400 leading-relaxed space-y-4">
        <div>
          <h3 className="text-zinc-100 font-semibold mb-1">Health Scores</h3>
          <p>
            The Overview page shows 4 health cards: tokens per turn, active
            plugins count, MCP server health, and warnings count. Green means
            healthy, amber means worth investigating, red means action needed.
            These are heuristic thresholds, not hard rules.
          </p>
        </div>
        <div>
          <h3 className="text-zinc-100 font-semibold mb-1">Warnings</h3>
          <p>
            The dashboard generates warnings for common issues: MCP servers that
            fail health checks, plugins with unusually high token costs, missing
            config files, duplicate MCP server definitions across sources, and
            more. Each warning includes a suggestion for how to fix it.
          </p>
        </div>
        <div>
          <h3 className="text-zinc-100 font-semibold mb-1">Cost Estimation</h3>
          <p>
            The token cost chart on the Overview page shows your top plugins by
            token consumption. This helps you identify which plugins are "worth
            it" and which are adding cost without much benefit. You can disable
            expensive plugins you rarely use.
          </p>
        </div>
        <p className="text-zinc-500 italic">
          Note: All insights are computed locally from your config files and
          session logs. Nothing is AI-generated or sent to any server.
        </p>
      </div>
    );
  }

  return (
    <div className="text-[13px] text-zinc-400 leading-relaxed space-y-4">
      <div>
        <h3 className="text-zinc-100 font-semibold mb-1">Health Scores</h3>
        <p>
          Four composite metrics derived from local config state: tokens/turn
          (sum of all active context), plugin count (enabled vs total), MCP
          health (stdio process ping + HTTP endpoint check), warning count
          (aggregated from all analyzers). Thresholds: green {"<"} 20k
          tokens/turn, amber {"<"} 40k, red above.
        </p>
      </div>
      <div>
        <h3 className="text-zinc-100 font-semibold mb-1">Warnings</h3>
        <p>
          Static analysis of config state. Detection rules: MCP health check
          failure (process not running or HTTP timeout), duplicate MCP
          definitions across source origins, plugins with {">"} 5k tokens,
          orphaned MCP references (plugin disabled but MCP still in global
          config), missing expected files, conflicting project/global overrides.
        </p>
      </div>
      <div>
        <h3 className="text-zinc-100 font-semibold mb-1">Cost Estimation</h3>
        <p>
          Bar chart ranking plugins by estimated token contribution. Calculated
          per-plugin as: instruction tokens + sum(skill tokens) + sum(MCP tool
          schema tokens). Allows identification of high-cost/low-use plugins for
          targeted disabling. Per-project view shows effective cost after
          overrides.
        </p>
      </div>
      <p className="text-zinc-500 italic">
        All analysis is deterministic, computed from local file reads. No LLM
        inference, no network calls, no telemetry.
      </p>
    </div>
  );
};

const UsageTrackingSection = ({ level }: { level: Level }) => {
  if (level === "beginner") {
    return (
      <div className="text-[13px] text-zinc-400 leading-relaxed space-y-3">
        <p>
          The Usage tab reads your local Claude Code session logs to estimate
          how many tokens you've used. It tracks two windows: the current
          session (last 5 hours of activity) and the current week (last 7 days).
        </p>
        <p>
          You can set your own limits for session and weekly usage. When you
          approach or exceed them, the dashboard shows a warning. These limits
          are for your own awareness only — they don't actually stop Claude Code
          from working.
        </p>
        <p>
          The per-project breakdown shows which projects consume the most tokens,
          helping you decide where to optimize your plugin setup.
        </p>
      </div>
    );
  }

  return (
    <div className="text-[13px] text-zinc-400 leading-relaxed space-y-3">
      <p>
        Parses JSONL session logs from ~/.claude/projects/*/sessions/. Session
        window: 5-hour rolling window from last activity timestamp. Weekly
        window: 7-day rolling window. Token counts extracted from logged
        request/response metadata (input_tokens, output_tokens fields).
      </p>
      <p>
        Configurable limits stored in dashboard's own config (not Claude Code's
        settings.json). Warning thresholds at 80% and 100% of configured limits.
        Per-project aggregation groups sessions by their project path.
      </p>
      <p>
        Accuracy caveat: session logs may not capture all interactions (e.g.,
        continued conversations, tool-use retries). Numbers should be treated as
        lower-bound estimates.
      </p>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

const STORAGE_KEY = "how-it-works-level";

const readInitialLevel = (): Level => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "beginner" || stored === "advanced") return stored;
  } catch {
    /* SSR or storage unavailable */
  }
  return "beginner";
};

export const HowItWorksPage = () => {
  const [level, setLevel] = useState<Level>(readInitialLevel);

  const handleChangeLevel = useCallback((next: Level) => {
    setLevel(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* noop */
    }
  }, []);

  return (
    <PageShell title="How it Works">
      <p className="text-zinc-400 text-[13px] mb-6">
        A plain-language guide to what this dashboard does, how Claude Code's
        plugin ecosystem fits together, and how to get the most out of it.
      </p>

      <LevelToggle level={level} onChangeLevel={handleChangeLevel} />

      <div className="mt-8">
        <SectionBlock title="The Problem">
          <ProblemSection level={level} />
        </SectionBlock>

        <SectionBlock title="Ecosystem Map">
          <EcosystemDiagram level={level} />
        </SectionBlock>

        <SectionBlock title="Core Concepts">
          <ConceptGrid level={level} />
        </SectionBlock>

        <SectionBlock title="How Config Works">
          <ConfigDiagram level={level} />
          {level === "advanced" && <FileMapTable />}
        </SectionBlock>

        <SectionBlock title="Dependencies & Side Effects">
          <DependencyCascade level={level} />
        </SectionBlock>

        <SectionBlock title="Token Economics">
          <TokenEconomicsSection level={level} />
        </SectionBlock>

        <SectionBlock title="Insights & Advice">
          <InsightsSection level={level} />
        </SectionBlock>

        <SectionBlock title="Usage Tracking">
          <DisclaimerCard />
          <div className="mt-4">
            <UsageTrackingSection level={level} />
          </div>
        </SectionBlock>

        <SectionBlock title="Dashboard Walkthrough">
          <WalkthroughGrid />
        </SectionBlock>

        <SectionBlock title="Quick Start">
          <QuickStartSteps level={level} />
        </SectionBlock>
      </div>
    </PageShell>
  );
};
