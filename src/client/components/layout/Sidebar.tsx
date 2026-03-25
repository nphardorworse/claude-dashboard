import type { ReactNode } from "react";
import { useRoute } from "../../hooks/use-route";
import { ProjectSelector } from "../projects/ProjectSelector";
import { UsageWidget } from "./UsageWidget";

/* ─── Nav icons (stroke-based, 16×16) ───────────── */

const iconProps = {
  width: 16,
  height: 16,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

const OverviewIcon = () => (
  <svg {...iconProps}>
    <rect x="3" y="3" width="7" height="7" rx="1" />
    <rect x="14" y="3" width="7" height="7" rx="1" />
    <rect x="3" y="14" width="7" height="7" rx="1" />
    <rect x="14" y="14" width="7" height="7" rx="1" />
  </svg>
);

const PluginsIcon = () => (
  <svg {...iconProps}>
    <path d="M12 2l-2 4h4l-2-4z" />
    <rect x="4" y="6" width="16" height="14" rx="2" />
    <path d="M9 6V4M15 6V4" />
  </svg>
);

const SkillsIcon = () => (
  <svg {...iconProps}>
    <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
  </svg>
);

const McpIcon = () => (
  <svg {...iconProps}>
    <rect x="2" y="2" width="20" height="8" rx="2" />
    <rect x="2" y="14" width="20" height="8" rx="2" />
    <circle cx="6" cy="6" r="1" fill="currentColor" stroke="none" />
    <circle cx="6" cy="18" r="1" fill="currentColor" stroke="none" />
  </svg>
);

const HooksIcon = () => (
  <svg {...iconProps}>
    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
    <polyline points="15 3 21 3 21 9" />
    <line x1="10" y1="14" x2="21" y2="3" />
  </svg>
);

const ProfilesIcon = () => (
  <svg {...iconProps}>
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </svg>
);

const UsageIcon = () => (
  <svg {...iconProps}>
    <line x1="18" y1="20" x2="18" y2="10" />
    <line x1="12" y1="20" x2="12" y2="4" />
    <line x1="6" y1="20" x2="6" y2="14" />
  </svg>
);

type NavItem = {
  label: string;
  hash: string;
  icon: ReactNode;
};

const NAV_ITEMS: NavItem[] = [
  { label: "Overview", hash: "/", icon: <OverviewIcon /> },
  { label: "Plugins", hash: "/plugins", icon: <PluginsIcon /> },
  { label: "Skills", hash: "/skills", icon: <SkillsIcon /> },
  { label: "MCP Servers", hash: "/mcp", icon: <McpIcon /> },
  { label: "Hooks", hash: "/hooks", icon: <HooksIcon /> },
  { label: "Profiles", hash: "/profiles", icon: <ProfilesIcon /> },
  { label: "Usage", hash: "/usage", icon: <UsageIcon /> },
];

type NavLinkProps = {
  item: NavItem;
  isActive: boolean;
};

const NavLink = ({ item, isActive }: NavLinkProps) => {
  return (
    <a
      href={`#${item.hash}`}
      className={`group relative flex items-center gap-3 px-5 py-2.5 text-[13px] font-medium transition-snappy ${
        isActive ? "text-zinc-50" : "text-zinc-400 hover:text-zinc-200"
      }`}
    >
      {/* Active indicator — glowing left bar */}
      <span
        className={`absolute left-0 top-1/2 h-5 w-[2px] -translate-y-1/2 rounded-r-full transition-snappy ${
          isActive
            ? "bg-blue-400 opacity-100 shadow-[0_0_8px_var(--glow-blue-nav)]"
            : "bg-transparent opacity-0"
        }`}
      />

      {/* Active background glow */}
      {isActive && (
        <span className="absolute inset-0 bg-gradient-to-r from-blue-500/[0.07] to-transparent" />
      )}

      <span
        className={`relative flex w-4 items-center justify-center transition-snappy ${
          isActive ? "text-blue-400" : "text-zinc-500 group-hover:text-zinc-300"
        }`}
      >
        {item.icon}
      </span>
      <span className="relative">{item.label}</span>
    </a>
  );
};

const NavList = ({ currentRoute }: { currentRoute: string }) => {
  return (
    <nav className="mt-1 flex flex-col gap-0.5">
      {NAV_ITEMS.map((item) => (
        <NavLink
          key={item.hash}
          item={item}
          isActive={currentRoute === item.hash}
        />
      ))}
    </nav>
  );
};

/* ─── Theme toggle ───────────────────────────────── */

const SunIcon = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <circle cx="12" cy="12" r="5" />
    <line x1="12" y1="1" x2="12" y2="3" />
    <line x1="12" y1="21" x2="12" y2="23" />
    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
    <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
    <line x1="1" y1="12" x2="3" y2="12" />
    <line x1="21" y1="12" x2="23" y2="12" />
    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
    <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
  </svg>
);

const MoonIcon = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
  </svg>
);

type ThemeToggleProps = {
  isDark: boolean;
  onToggle: () => void;
};

const ThemeToggle = ({ isDark, onToggle }: ThemeToggleProps) => (
  <button
    onClick={onToggle}
    className="flex h-10 w-10 items-center justify-center rounded-lg text-zinc-500 transition-snappy hover:bg-[var(--overlay-subtle)] hover:text-zinc-300"
    title={isDark ? "Switch to light mode" : "Switch to dark mode"}
  >
    {isDark ? <SunIcon /> : <MoonIcon />}
  </button>
);

/* ─── Sidebar ────────────────────────────────────── */

type SidebarProps = {
  projectPath: string | null;
  onSelectProject: (path: string | null) => void;
  isDark: boolean;
  onToggleTheme: () => void;
};

export const Sidebar = ({
  projectPath,
  onSelectProject,
  isDark,
  onToggleTheme,
}: SidebarProps) => {
  const route = useRoute();

  return (
    <aside className="relative flex h-screen w-60 shrink-0 flex-col border-r border-[var(--border-hairline)] bg-[var(--surface-sidebar)]">
      {/* Subtle inner highlight on right edge */}
      <span className="absolute right-0 top-0 bottom-0 w-px bg-gradient-to-b from-[var(--overlay-faint)] via-[var(--border-hairline)] to-[var(--overlay-faint)]" />

      <div className="px-6 pt-3">
        <img src="/logo.png" alt="" width={50} height={50} className="mb-1.5" />
        <h2 className="text-[13px] font-semibold tracking-wide text-zinc-100">
          Claude Code Dashboard
        </h2>
        <p className="mt-1 text-[11px] font-medium tracking-wider uppercase text-zinc-500">
          Configuration Manager
        </p>
      </div>

      <ProjectSelector projectPath={projectPath} onSelect={onSelectProject} />

      <NavList currentRoute={route} />

      {/* Spacer — push usage widget + footer to bottom */}
      <div className="flex-1" />

      {/* Plan usage — always visible */}
      <UsageWidget selectedProjectPath={projectPath} />

      {/* Bottom — version + theme toggle */}
      <div className="border-t border-[var(--border-hairline)] px-6 py-4">
        <div className="flex items-center justify-between">
          <p className="text-[10px] uppercase tracking-[0.15em] text-zinc-500">
            v1.0 — Local Only
          </p>
          <ThemeToggle isDark={isDark} onToggle={onToggleTheme} />
        </div>
      </div>
    </aside>
  );
};
