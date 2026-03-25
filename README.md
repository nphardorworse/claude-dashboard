# Claude Code Dashboard

A local web dashboard for managing Claude Code's settings, plugins, MCP servers, hooks, and profiles — per-project or globally.

Built to solve token bloat: visualize what loads into every Claude Code session, toggle what you don't need, and track cost across projects.

## Quick Start

```bash
cd ~/Documents/projects/claude-dashboard
npm install
npm run dev
# Opens at http://localhost:5175
# Server runs on http://localhost:3847
```

Single command starts both the Hono API server and the Vite dev server with proxy.

## Why This Exists

Claude Code loads plugins, MCP servers, hooks, and skills into every conversation turn. Each adds to the system prompt token count. With 39 plugins and 13 MCP servers enabled, a single planning agent was burning 40% of a Max subscription's daily tokens.

This dashboard lets you:

- See exactly what's loading and how many tokens each plugin costs
- Toggle plugins/MCPs/hooks on/off per project
- Switch between plugin profiles (mobile, science, web, core)
- Track session costs and token usage across projects
- Set MCP defaults so new projects don't inherit everything

## Architecture

```
claude-dashboard/
├── src/
│   ├── server/                    # Hono API (port 3847)
│   │   ├── index.ts               # App entry, mounts all routes
│   │   ├── routes/
│   │   │   ├── config.ts          # GET/PUT global settings + local overrides
│   │   │   ├── plugins.ts         # Plugin list, toggle, bulk-toggle (scope-aware)
│   │   │   ├── profiles.ts        # Profile CRUD, switch, save-current (scope-aware)
│   │   │   ├── mcp.ts             # MCP servers list, add, remove, health (scope-aware)
│   │   │   ├── hooks.ts           # Hook events CRUD (scope-aware)
│   │   │   ├── health.ts          # Aggregated health + token estimation (scope-aware)
│   │   │   ├── projects.ts        # Project discovery + per-project settings
│   │   │   ├── sessions.ts        # Session history from usage-data
│   │   │   └── defaults.ts        # Default MCP state for new projects
│   │   └── lib/
│   │       ├── paths.ts           # All Claude config file paths + scope helpers
│   │       ├── file-io.ts         # Safe JSON read/write with atomic writes + backups
│   │       ├── plugin-scanner.ts  # Scan installed plugins, estimate token costs
│   │       ├── mcp-health.ts      # Parse `claude mcp list` output
│   │       ├── cost-estimator.ts  # Token estimation heuristics
│   │       └── session-scanner.ts # Read session-meta files with caching
│   ├── client/                    # React 19 + Tailwind v4 (port 5175)
│   │   ├── App.tsx                # Layout + hash routing + project scope
│   │   ├── hooks/
│   │   │   ├── use-route.ts       # Hash-based routing
│   │   │   ├── use-project.ts     # Selected project (localStorage-persisted)
│   │   │   └── use-health.ts      # Polling health endpoint
│   │   ├── lib/
│   │   │   └── api.ts             # buildScopedUrl, getProjectDisplayName
│   │   └── components/
│   │       ├── layout/            # Sidebar, PageShell
│   │       ├── overview/          # HealthCards, CostEstimator, SessionHistory, LocalOverrides
│   │       ├── plugins/           # PluginGrid, PluginCard, CategoryFilter, search + status filter
│   │       ├── mcp/               # McpServerCard, AddServerForm, McpDefaults, ApplyDefaults
│   │       ├── hooks-manager/     # HookEventCard, AddHookForm
│   │       ├── profiles/          # ProfileCard, SaveCurrentForm
│   │       ├── projects/          # ProjectSelector, ProjectSettingsPage
│   │       └── shared/            # Toggle, Badge, Toast, ScopeBanner
│   └── shared/
│       └── types.ts               # Shared TypeScript types
├── package.json
├── vite.config.ts                 # React plugin + Tailwind + proxy to :3847
├── tsconfig.json                  # Client TypeScript config
└── tsconfig.server.json           # Server TypeScript config
```

**Stack:** React 19, Tailwind CSS v4, Hono, TypeScript, Vite, tsx (watch mode)

## Config Files Managed

The dashboard reads and writes these Claude Code configuration files:

| File                                       | Scope         | Read/Write | What It Controls                               |
| ------------------------------------------ | ------------- | ---------- | ---------------------------------------------- |
| `~/.claude/settings.json`                  | Global        | R/W        | Plugins, hooks, permissions, effortLevel       |
| `~/.claude/settings.local.json`            | Global local  | R/W        | Machine-specific permissions (gitignored)      |
| `~/.claude.json`                           | Global        | R/W        | MCP servers, per-project settings, usage stats |
| `~/.claude/plugins/installed_plugins.json` | Global        | R          | Plugin metadata, install paths, versions       |
| `~/.claude/plugins/cache/*/`               | Global        | R          | Plugin content for token cost estimation       |
| `~/.claude/profiles/*.json`                | Global        | R/W        | Plugin group profiles                          |
| `~/.claude/usage-data/session-meta/*.json` | Global        | R          | Per-session cost/token/tool data               |
| `~/.claude/dashboard-config.json`          | Dashboard     | R/W        | MCP defaults for new projects                  |
| `<project>/.claude/settings.json`          | Project       | R/W        | Project-level plugin/hook overrides            |
| `<project>/.claude/settings.local.json`    | Project local | R/W        | Project permissions, MCP toggles               |
| `<project>/.mcp.json`                      | Project       | R/W        | Project-specific MCP servers                   |

**Safety:** Every write operation creates a timestamped backup in `~/.claude/backups/` before modifying any file. Writes are atomic (write to `.tmp`, then rename).

## Pages

### Overview (`#/`)

- **4 health cards:** active plugins, MCP servers, hook events, estimated tokens/turn
- **Token cost chart:** top-10 plugins by estimated token cost (horizontal bar chart)
- **Project cost table** (global view): cumulative cost per project directory with model breakdown
- **Session history** (project view): per-session table with date, duration, prompt, messages, tokens, tool usage, lines changed
- **Local overrides:** edit global `settings.local.json` permissions
- **Warnings:** high token usage, duplicate plugins, excessive hooks

### Plugins (`#/plugins`)

- **Grid of all 64+ installed plugins** with toggle switches
- **Search bar:** filter by name, ID, or description
- **Status filter:** All / Active / Inactive toggle
- **Category filter:** filter by marketplace (claude-plugins-official, callstack, etc.)
- **Token cost badges:** green (low), yellow (medium), red (high) per plugin
- **Type badges:** Agent, Skill, MCP indicators
- **Source tracking:** shows "global", "project override", or "default" per plugin
- **Optimistic toggles:** UI updates instantly, API fires in background

### MCP Servers (`#/mcp`)

- **Server list** with health status dots (green=connected, yellow=needs auth, red=failed)
- **3 sources merged:** global `~/.claude.json`, project `.mcp.json`, and `~/.claude.json` per-project entries
- **Source badges:** shows where each server is configured
- **Add/remove** servers with inline form
- **Disabled servers section:** shows MCPs that were disabled per-project
- **MCP defaults** (global view): toggle which MCPs are disabled by default for new projects
- **Apply defaults** (project view): one-click apply default disabled MCPs to the current project

### Hooks (`#/hooks`)

- **Event cards** for each active hook event (PostToolUse, PreToolUse, etc.)
- **Matcher + command pairs** with remove buttons
- **Add hook form** with event dropdown, matcher, command, optional timeout
- **15 hook events** supported: SessionStart, SessionEnd, PreToolUse, PostToolUse, UserPromptSubmit, Notification, Stop, SubagentStop, PreCompact, PostCompact, PermissionRequest, ConfigChange, InstructionsLoaded, StopFailure, SubagentStart

### Profiles (`#/profiles`)

- **Profile cards:** core (13 plugins), mobile (20), science (18), web (19), full (38)
- **One-click switch:** activate a profile globally or per-project
- **Active detection:** compares current enabledPlugins against each profile
- **Save current:** snapshot the current effective plugin state as a new profile
- **Scope-aware:** switching a profile in project view writes to the project's settings

### Project Settings (`#/project`)

- **Project selector** in sidebar (discovers 25+ projects from `~/.claude.json`)
- **Cost summary:** total cost, sessions, per-model breakdown
- **Permissions editor:** add/remove allowed tools for the project
- **Project hooks:** view/remove hooks defined in project settings
- **Project MCP toggles:** enable/disable MCP servers, toggle `enableAllProjectMcpServers`

## Scope System

Every page (except Overview global view) is scope-aware. A project selector dropdown in the sidebar controls the scope:

- **Global** (no project selected): reads/writes `~/.claude/settings.json` and `~/.claude.json`
- **Project** (project selected): reads/writes `<project>/.claude/settings.json` and `<project>/.mcp.json`

The scope banner on each page shows which file will be modified, e.g.:

```
Global — writes to ~/.claude/settings.json
snack-move (project overrides) — writes to ~/Documents/.../snack-move/.claude/settings.json
```

### Plugin Resolution Order

When a project is selected, plugins resolve through a 3-layer system:

1. **Project** `enabledPlugins` (highest priority)
2. **Global** `enabledPlugins`
3. **Default** (plugin installed but not mentioned anywhere → enabled)

Each plugin card shows its source: "global", "project override", or "default".

### MCP Server Sources

MCP servers are discovered from 3 locations and merged:

1. `~/.claude.json` → `mcpServers` (global servers)
2. `~/.claude.json` → `projects[path].mcpServers` (per-project in global config)
3. `<project>/.mcp.json` → `mcpServers` (per-project file)

Each server card shows its source badge.

## Token Cost Estimation

Plugin token costs are estimated by scanning all text files in each plugin's install directory:

```
tokens = ceil(total_bytes / 3.5)
```

Thresholds:

- **Low** (green): < 5,000 tokens per plugin
- **Medium** (yellow): 5,000–50,000 tokens
- **High** (red): > 50,000 tokens

Overall budget:

- **Low**: < 50,000 total tokens/turn
- **Medium**: 50,000–150,000
- **High**: > 150,000 (warning shown)

## CLI Profile Switcher

A companion CLI tool at `~/.claude/profiles/switch-profile.sh` enables quick switching from any terminal:

```bash
claude-profile mobile    # 20 plugins — RN/Expo/Convex
claude-profile science   # 18 plugins — life sciences
claude-profile web       # 19 plugins — frontend/SEO/Playwright
claude-profile core      # 13 plugins — bare minimum
claude-profile full      # 38 plugins — everything
```

Alias configured in `~/.zshrc`. Profiles are stored as JSON files in `~/.claude/profiles/`.

## API Reference

All endpoints are at `http://localhost:3847/api/`. Most accept an optional `?project=<base64-encoded-path>` query parameter to operate in project scope.

| Method | Endpoint                           | Description                                                |
| ------ | ---------------------------------- | ---------------------------------------------------------- |
| GET    | `/health`                          | Aggregated health summary + warnings + top plugins by cost |
| GET    | `/plugins`                         | All plugins with metadata, token costs, enabled state      |
| PUT    | `/plugins/toggle`                  | Toggle single plugin `{ pluginId, enabled }`               |
| PUT    | `/plugins/bulk-toggle`             | Toggle multiple plugins `{ pluginIds, enabled }`           |
| GET    | `/mcp/servers`                     | All MCP servers with health + disabled list                |
| POST   | `/mcp/servers`                     | Add server `{ name, command, args }`                       |
| DELETE | `/mcp/servers/:name`               | Remove server                                              |
| POST   | `/mcp/health-check`                | Refresh health status                                      |
| GET    | `/hooks`                           | All hooks by event + available events                      |
| PUT    | `/hooks`                           | Update hooks for event `{ event, hooks }`                  |
| DELETE | `/hooks/:event`                    | Remove all hooks for event                                 |
| POST   | `/hooks/add`                       | Add single hook `{ event, matcher, command }`              |
| GET    | `/profiles`                        | All profiles with active detection                         |
| POST   | `/profiles/switch`                 | Activate profile `{ profileName }`                         |
| POST   | `/profiles/save-current`           | Snapshot current state `{ name, description }`             |
| GET    | `/projects`                        | Discover projects with cost/session data                   |
| GET    | `/projects/:path/settings`         | Read project config files                                  |
| GET    | `/sessions`                        | Session history with token/tool breakdown                  |
| GET    | `/config/global-settings`          | Read global settings.json                                  |
| GET    | `/config/global-local`             | Read global settings.local.json                            |
| PUT    | `/config/global-local/permissions` | Update global permissions                                  |
| GET    | `/defaults`                        | Read MCP defaults config                                   |
| PUT    | `/defaults/disabled-mcps`          | Set default disabled MCPs                                  |
| POST   | `/defaults/apply`                  | Apply defaults to a project                                |

## Development

```bash
npm run dev          # Start both server + client
npm run typecheck    # Check types (client + server)
npm run build        # Production build
```

The server uses `tsx watch` for hot reload. The client uses Vite with HMR. Changes to either side reflect immediately.
