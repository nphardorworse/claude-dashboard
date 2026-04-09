# Claude Code Dashboard

A local web dashboard for managing Claude Code's settings, plugins, skills, MCP servers, hooks, profiles, and usage — per-project or globally.

Built to solve token bloat: visualize what loads into every Claude Code session, toggle what you don't need, and track usage across projects.

> **Disclaimers** — please read the [Disclaimers](#disclaimers) section before relying on any numbers shown by this tool.

## Quick Start

```bash
git clone <repo-url> claude-dashboard
cd claude-dashboard
npm install
npm run dev
# Client: http://localhost:5175
# Server: http://localhost:3847 (bound to 127.0.0.1)
```

Single command starts both the Hono API server and the Vite dev server with proxy.

## Why This Exists

Claude Code loads plugins, MCP servers, hooks, and skills into every conversation turn. Each adds to the system prompt token count. With dozens of plugins and many MCP servers enabled, a single session can consume a large portion of your plan's limits.

This dashboard lets you:

- See exactly what's loading and how many tokens each plugin/skill costs
- Toggle plugins, skills, MCPs, and hooks on/off — globally or per project
- Switch between configuration profiles for different workflows
- Track approximate session and weekly usage across projects
- Set MCP defaults so new projects don't inherit everything
- View warnings and health indicators for your setup

## Pages

### Overview (`#/`)

- **4 health cards:** active plugins, MCP servers, hook events, estimated tokens/turn
- **Token cost chart:** top plugins by estimated token cost (horizontal bar chart)
- **Project cost table** (global view): cumulative cost per project with model breakdown
- **Session history** (project view): per-session table with date, duration, messages, tokens, tool usage
- **Local overrides:** edit global `settings.local.json` permissions
- **Warnings:** high token usage, duplicate plugins, excessive hooks

### Plugins (`#/plugins`)

- Grid of installed plugins with toggle switches
- Search bar: filter by name, ID, or description
- Status filter: All / Active / Inactive
- Category filter: filter by marketplace
- Token cost badges: green (low), yellow (medium), red (high) per plugin
- Source tracking: shows "global", "project override", or "default" per plugin
- Optimistic toggles: UI updates instantly, API fires in background

### Skills (`#/skills`)

- All skills with toggle switches (plugin-bundled and standalone)
- Toggle individual skills without disabling the parent plugin
- Token cost estimates per skill
- Search and filter by status

### MCP Servers (`#/mcp`)

- Unified catalog from 6 source origins: global, global-disabled, plugin, project, personal, cloud
- Health status dots (green = connected, yellow = needs auth, red = failed)
- Source badges showing where each server is configured
- Add/remove servers with inline form
- Disabled servers section
- MCP defaults (global view): toggle which MCPs are disabled by default for new projects
- Apply defaults (project view): one-click apply default disabled MCPs to current project

### Hooks (`#/hooks`)

- Event cards for each active hook event
- Matcher + command pairs with remove buttons
- Add hook form with event dropdown, matcher, command, optional timeout
- 15 hook events supported: SessionStart, SessionEnd, PreToolUse, PostToolUse, UserPromptSubmit, Notification, Stop, SubagentStop, PreCompact, PostCompact, PermissionRequest, ConfigChange, InstructionsLoaded, StopFailure, SubagentStart

### Profiles (`#/profiles`)

- Profile cards for your saved presets and custom profiles
- One-click switch: activate a profile globally or per-project
- Active detection: compares current settings against each profile
- Save current: snapshot the current effective state as a new profile
- Each profile stores: enabled plugins, enabled skills, hooks, and MCP server state

### Usage (`#/usage`)

- Rolling-window usage tracking: session (5-hour) and weekly (7-day) windows
- Per-project breakdown showing messages, tokens, and estimated cost
- Configurable message limits for your own tracking (not connected to Anthropic's limits)
- Warning thresholds at 80% and 100% of configured limits

### Transcripts (`#/transcripts`)

- **Session viewer:** Browse any session's full conversation — every user prompt, assistant reply, tool call, and tool result
- **Filter modes:** All (raw), Conversation (user-facing only), User only, Assistant only
- **Order toggle:** Oldest first / Newest first
- **Session header:** Shows session name, full session ID, and `claude --resume` command
- **Snapshots:** Save immutable copies of session transcripts that survive compaction, rotation, or deletion
  - **Save Full:** Archives the complete raw JSONL
  - **Save Conversation Only:** Archives only user prompts and assistant text responses (no tool calls/results) — archive-only, cannot be spawned as a new session
  - Snapshots are never overwritten — each save creates a new independent copy
- **Export / Import:** Download snapshots as portable `.json` files, share with colleagues, import on another machine
- **Spawn Session (full snapshots only):** Creates a new Claude Code session (new UUID) seeded with a snapshot's conversation context — run `claude --resume <newId>` to continue from where the snapshot left off

### How It Works (`#/how-it-works`)

- Interactive guide with beginner/advanced toggle
- Ecosystem diagram, config resolution diagram, dependency cascades
- Token economics explanation and cost estimation methodology
- Dashboard walkthrough and quick start steps

## Architecture

```
claude-dashboard/
├── src/
│   ├── server/                    # Hono API (port 3847, localhost only)
│   │   ├── index.ts               # App entry, mounts all routes, auth
│   │   ├── routes/
│   │   │   ├── config.ts          # GET/PUT global settings + local overrides
│   │   │   ├── plugins.ts         # Plugin list, toggle, bulk-toggle
│   │   │   ├── skills.ts          # Skill list, toggle
│   │   │   ├── profiles.ts        # Profile CRUD, switch, save-current
│   │   │   ├── mcp.ts             # MCP server catalog, add, remove, health
│   │   │   ├── hooks.ts           # Hook events CRUD
│   │   │   ├── health.ts          # Aggregated health + token estimation
│   │   │   ├── projects.ts        # Project discovery + per-project settings
│   │   │   ├── sessions.ts        # Session history from session-meta
│   │   │   ├── defaults.ts        # Default MCP state for new projects
│   │   │   ├── analytics.ts       # Per-session and per-project analytics
│   │   │   ├── usage.ts           # Rolling-window usage tracking
│   │   │   └── transcripts.ts     # Transcript viewer, snapshots, export/import, spawn
│   │   └── lib/
│   │       ├── paths.ts           # All Claude config file paths + scope helpers
│   │       ├── file-io.ts         # Safe JSON read/write with atomic writes + backups
│   │       ├── file-lock.ts       # In-process async mutex for write serialization
│   │       ├── auth.ts            # Token-based auth for mutating endpoints
│   │       ├── validation.ts      # Input validation for all write endpoints
│   │       ├── plugin-scanner.ts  # Scan installed plugins, estimate token costs
│   │       ├── skill-scanner.ts   # Scan plugin skills, resolve enable state
│   │       ├── plugin-mcp-scanner.ts # Scan MCPs bundled with plugins
│   │       ├── catalog-builder.ts # Build unified MCP catalog from all sources
│   │       ├── mcp-health.ts      # Parse `claude mcp list` output
│   │       ├── cost-estimator.ts  # Token estimation heuristics
│   │       ├── pricing.ts         # Model pricing data for cost estimates
│   │       ├── insights.ts        # Generate health insights from session data
│   │       ├── jsonl-parser.ts    # Parse session JSONL for detailed analytics
│   │       ├── transcript-parser.ts # Parse JSONL into readable transcripts
│   │       ├── session-scanner.ts # Read session-meta files with caching
│   │       └── types.ts           # Server-side type definitions
│   ├── client/                    # React 19 + Tailwind v4 (port 5175)
│   │   ├── App.tsx                # Layout + hash routing + project scope
│   │   ├── hooks/                 # use-route, use-project, use-health, use-usage, etc.
│   │   ├── lib/
│   │   │   └── api.ts             # buildScopedUrl, apiFetch with auth
│   │   └── components/
│   │       ├── layout/            # Sidebar, PageShell
│   │       ├── overview/          # HealthCards, CostEstimator, SessionHistory
│   │       ├── plugins/           # PluginGrid, PluginCard, filters
│   │       ├── skills/            # SkillsPage, SkillCard
│   │       ├── mcp/               # McpServerCard, AddServerForm, McpDefaults
│   │       ├── hooks-manager/     # HookEventCard, AddHookForm
│   │       ├── profiles/          # ProfileCard, ProfileEditor, SaveCurrentForm
│   │       ├── usage/             # UsagePage, windowed usage display
│   │       ├── transcripts/       # TranscriptsPage, SessionPicker, SnapshotPicker, TranscriptView
│   │       ├── how-it-works/      # Interactive guide with diagrams
│   │       ├── projects/          # ProjectSelector
│   │       ├── shared/            # Toggle, Badge, Toast, ScopeBanner
│   │       └── ui/                # shadcn/ui primitives
│   └── shared/
│       └── types.ts               # Shared TypeScript types (client + server)
├── package.json
├── vite.config.ts                 # React plugin + Tailwind + proxy to :3847
├── tsconfig.json                  # Client TypeScript config
└── tsconfig.server.json           # Server TypeScript config
```

**Stack:** React 19, Tailwind CSS v4, Hono, TypeScript, Vite, tsx (watch mode)

## Config Files Managed

The dashboard reads and writes these Claude Code configuration files:

| File | Scope | Read/Write | What It Controls |
| --- | --- | --- | --- |
| `~/.claude/settings.json` | Global | R/W | Plugins, skills, hooks, permissions |
| `~/.claude/settings.local.json` | Global local | R/W | Machine-specific permissions (gitignored) |
| `~/.claude.json` | Global | R/W | MCP servers, per-project settings, usage stats |
| `~/.claude/plugins/installed_plugins.json` | Global | R | Plugin metadata, install paths, versions |
| `~/.claude/plugins/cache/*/` | Global | R | Plugin content for token cost estimation |
| `~/.claude/profiles/*.json` | Global | R/W | Configuration profiles (plugins, skills, hooks, MCP) |
| `~/.claude/usage-data/session-meta/*.json` | Global | R | Per-session cost/token/tool data |
| `~/.claude/dashboard-config.json` | Dashboard | R/W | MCP defaults, plan limits |
| `~/.claude/dashboard-snapshots/*.json` | Dashboard | R/W | Immutable transcript snapshots |
| `<project>/.claude/settings.json` | Project | R/W | Project-level plugin/skill/hook overrides |
| `<project>/.claude/settings.local.json` | Project local | R/W | Project permissions, MCP toggles |
| `<project>/.mcp.json` | Project | R/W | Project-specific MCP servers |

**Safety:** Every write operation creates a timestamped backup before modifying any file. Writes are atomic (write to `.tmp`, then rename). All write endpoints use in-process file locks to prevent concurrent read-modify-write races.

## Scope System

Every page is scope-aware. A project selector dropdown in the sidebar controls the scope:

- **Global** (no project selected): reads/writes `~/.claude/settings.json` and `~/.claude.json`
- **Project** (project selected): reads/writes `<project>/.claude/settings.json` and `<project>/.mcp.json`

The scope banner on each page shows which file will be modified.

### Plugin Resolution Order

When a project is selected, plugins resolve through a 3-layer system:

1. **Project** `enabledPlugins` (highest priority)
2. **Global** `enabledPlugins`
3. **Default** (plugin installed but not mentioned anywhere = enabled)

### MCP Server Sources

MCP servers are discovered from 6 origins and merged into a unified catalog:

1. **global** — `~/.claude.json` > `mcpServers`
2. **global-disabled** — `~/.claude.json` > `disabledMcpServers`
3. **plugin** — `.mcp.json` files bundled inside plugin directories
4. **project** — `<project>/.mcp.json` > `mcpServers`
5. **personal** — `~/.claude.json` > `projects[path].mcpServers`
6. **cloud** — Anthropic-hosted MCP servers (runtime only, read-only)

## Token Cost Estimation

Plugin and skill token costs are estimated by scanning all text files in each plugin's directory:

```
tokens ≈ ceil(total_bytes / 3.5)
```

Per-plugin thresholds (% of context window):
- **Low** (green): < 1%
- **Medium** (yellow): 1–5%
- **High** (red): > 5%

Aggregate thresholds (% of context window):
- **Low**: < 15%
- **Medium**: 15–40%
- **High**: > 40% (warning shown)

Context window defaults to 200k tokens, auto-detected from your most-used model (1M for Opus 4.6), or set manually in the Usage tab.

## Security

- **Localhost only:** The API server binds to `127.0.0.1` — not accessible from the network
- **Auth on writes:** All mutating endpoints (POST, PUT, DELETE) require `Authorization: Bearer <token>`. The token is generated on first startup and stored at `~/.claude/dashboard-token`
- **CORS restricted:** Only `http://localhost:5175` is allowed as an origin
- **Input validation:** All write endpoints validate input (permissions, hooks, settings IDs, MCP server configs) before writing
- **File locks:** All write endpoints serialize concurrent access with in-process async mutexes
- **Atomic writes:** Config files are written to a `.tmp` file first, then renamed
- **Backups:** Timestamped backups are created before every write

## Disclaimers

### Not an Official Anthropic Product

This dashboard is an independent, community-built tool. It is **not affiliated with, endorsed by, or supported by Anthropic**. It interacts with Claude Code's local configuration files, which are not a public API and may change without notice in any Claude Code update.

### Token and Cost Numbers Are Approximations

- **Token estimates** use a ~3.5 characters per token heuristic. Actual tokenization varies by model and content. These numbers are useful for relative comparison (which plugin costs more), not as exact billing data.
- **Cost estimates** use hardcoded model pricing that may become outdated as Anthropic changes pricing. The dashboard uses Sonnet pricing as a baseline for usage cost estimates.
- **Usage tracking** is derived from local session log files (`session-meta` JSONL). These logs may not capture all interactions (continued conversations, retries, etc.). Numbers should be treated as lower-bound estimates, not billing statements.

### Plan Limits Are Not Known

Anthropic does not publish exact message limits for Claude Max, Pro, or other subscription plans. The "session limit" and "weekly limit" features in the Usage tab are **self-set tracking thresholds** — they are not connected to Anthropic's actual rate limiting and cannot predict when you'll be throttled.

### Config File Compatibility

This dashboard reads and writes Claude Code's configuration files (settings.json, .claude.json, .mcp.json, etc.). These file formats are not part of a stable public API:

- **Future Claude Code updates** may change the structure of these files, add new fields, or change how settings are resolved. The dashboard may need to be updated to remain compatible.
- **The dashboard preserves unrecognized fields** when writing — it does not strip fields it doesn't understand. However, there is always a theoretical risk that writing to these files could cause unexpected behavior if the file format changes.
- **Backups are created before every write.** If something goes wrong, your previous config is preserved at `~/.claude/backups/`.

### Profiles Are a Dashboard Feature

Profiles (saved configuration presets) are **not a built-in Claude Code feature**. They are managed entirely by this dashboard and stored in `~/.claude/profiles/`. Claude Code itself does not know about profiles — the dashboard applies them by writing the profile's settings into the appropriate config files.

### Local-Only, No Telemetry

This dashboard runs entirely locally. It does not send any data to external servers, does not phone home, and does not include analytics or telemetry. All data is read from and written to local files on your machine.

### No Warranty

This software is provided "as is", without warranty of any kind. Use at your own risk. Always review changes in your config files if something seems off, and keep backups of important configurations before making bulk changes.

## Development

```bash
npm run dev          # Start both server + client (hot reload)
npm run typecheck    # Check types (client + server)
npm run build        # Production build
npm run lint         # ESLint check
npm run lint:fix     # ESLint autofix
```

The server uses `tsx watch` for hot reload. The client uses Vite with HMR.

## API Reference

All endpoints are at `http://localhost:3847/api/`. Most accept an optional `?project=<base64-encoded-path>` query parameter to operate in project scope. Write operations require `Authorization: Bearer <token>`.

<details>
<summary>Full endpoint list</summary>

| Method | Endpoint | Description |
| --- | --- | --- |
| GET | `/ping` | Health check |
| GET | `/auth/token` | Bootstrap auth token (CORS-protected) |
| GET | `/health` | Aggregated health summary + warnings + top plugins by cost |
| GET | `/plugins` | All plugins with metadata, token costs, enabled state |
| PUT | `/plugins/toggle` | Toggle single plugin `{ pluginId, enabled }` |
| PUT | `/plugins/bulk-toggle` | Toggle multiple plugins `{ pluginIds, enabled }` |
| GET | `/skills` | All skills with metadata, token costs, enabled state |
| PUT | `/skills/toggle` | Toggle single skill `{ skillId, enabled }` |
| GET | `/mcp/servers` | All MCP servers with health + disabled list |
| POST | `/mcp/servers` | Add server `{ name, command, args }` |
| DELETE | `/mcp/servers/:name` | Remove server |
| POST | `/mcp/health-check` | Refresh health status |
| GET | `/hooks` | All hooks by event + available events |
| PUT | `/hooks` | Update hooks for event `{ event, hooks }` |
| DELETE | `/hooks/:event` | Remove all hooks for event |
| POST | `/hooks/add` | Add single hook `{ event, matcher, command }` |
| GET | `/profiles` | All profiles with active detection |
| POST | `/profiles/switch` | Activate profile `{ profileName }` |
| POST | `/profiles/save-current` | Snapshot current state `{ name, description }` |
| DELETE | `/profiles/:name` | Delete a profile |
| GET | `/projects` | Discover projects with cost/session data |
| GET | `/projects/:path/settings` | Read project config files |
| PUT | `/projects/:path/settings` | Write project settings.json |
| PUT | `/projects/:path/local-settings` | Write project settings.local.json |
| PUT | `/projects/:path/hooks` | Update project hooks |
| PUT | `/projects/:path/permissions` | Update project permissions |
| GET | `/sessions` | Session history with token/tool breakdown |
| GET | `/analytics/session/:id` | Detailed single-session analytics |
| GET | `/analytics/project` | Aggregated project analytics |
| GET | `/usage` | All-time usage summary per project |
| GET | `/usage/windowed` | Rolling-window usage (session + weekly) |
| GET | `/config/global-settings` | Read global settings.json |
| PUT | `/config/global-settings` | Write global settings.json |
| GET | `/config/global-local` | Read global settings.local.json |
| PUT | `/config/global-local` | Write global settings.local.json |
| PUT | `/config/global-local/permissions` | Update global permissions |
| GET | `/config/claude-json` | Read MCP servers from ~/.claude.json |
| GET | `/defaults` | Read MCP defaults config |
| PUT | `/defaults/disabled-mcps` | Set default disabled MCPs |
| POST | `/defaults/apply` | Apply defaults to a project |
| GET | `/transcripts/session/:id` | Full readable transcript for a live session |
| POST | `/transcripts/snapshots` | Save snapshot `{ sessionId, projectPath, note?, conversationOnly? }` |
| GET | `/transcripts/snapshots` | List all snapshots (optionally scoped to project) |
| GET | `/transcripts/snapshots/:id` | Load snapshot transcript |
| DELETE | `/transcripts/snapshots/:id` | Delete a snapshot |
| GET | `/transcripts/snapshots/:id/export` | Download snapshot as portable JSON |
| POST | `/transcripts/snapshots/import` | Import a snapshot from JSON |
| POST | `/transcripts/snapshots/:id/spawn` | Create new session from snapshot |

</details>
