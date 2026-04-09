import type { ReactNode } from "react";
import { version } from "../../../../package.json";
import { useRoute } from "../../hooks/use-route";
import { ProjectSelector } from "../projects/ProjectSelector";
import { UsageWidget } from "./UsageWidget";
import {
  OverviewIcon,
  PluginsIcon,
  SkillsIcon,
  McpIcon,
  HooksIcon,
  ProfilesIcon,
  UsageIcon,
  HowItWorksIcon,
  TranscriptsIcon,
} from "../shared/NavIcons";

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
  { label: "Transcripts", hash: "/transcripts", icon: <TranscriptsIcon /> },
  { label: "How it Works", hash: "/how-it-works", icon: <HowItWorksIcon /> },
];

type NavLinkProps = {
  item: NavItem;
  isActive: boolean;
};

const NavLink = ({ item, isActive }: NavLinkProps) => {
  return (
    <a
      href={`#${item.hash}`}
      className={`group relative flex items-center gap-3 px-5 py-2 text-[13px] font-medium transition-snappy ${
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
    className="flex h-10 w-10 items-center justify-center rounded-lg text-zinc-500 transition-snappy hover:bg-[var(--overlay-subtle)] hover:text-zinc-300 active:scale-[0.96]"
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
      <div className="px-6 pt-3">
        <img
          src="/logo.png"
          alt=""
          width={50}
          height={50}
          className="mb-1.5 rounded-lg ring-1 ring-[var(--border-hairline)]"
        />
        <h2 className="text-[13px] font-semibold tracking-wide text-zinc-100">
          Claude Code Dashboard
        </h2>
        <p className="mt-1 text-[11px] font-medium tracking-wider uppercase text-zinc-500">
          Configuration Manager
        </p>
      </div>

      <ProjectSelector projectPath={projectPath} onSelect={onSelectProject} />

      {/* Scrollable nav — grows but scrolls when sidebar is short */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <NavList currentRoute={route} />
      </div>

      {/* Plan usage — always visible */}
      <UsageWidget selectedProjectPath={projectPath} />

      {/* Bottom — version + theme toggle */}
      <div className="border-t border-[var(--border-hairline)] px-6 py-1">
        <div className="flex items-center justify-between">
          <p className="text-[10px] uppercase tracking-[0.15em] text-zinc-500">
            v{version}
          </p>
          <ThemeToggle isDark={isDark} onToggle={onToggleTheme} />
        </div>
      </div>
    </aside>
  );
};
