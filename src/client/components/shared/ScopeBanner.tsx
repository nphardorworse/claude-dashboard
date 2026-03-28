import { getProjectDisplayName } from "../../lib/api";
import { GlobeIcon, FolderIcon, XIcon } from "../shared/NavIcons";

type ScopeBannerProps = {
  projectPath: string | null;
  /** Which config domain this page manages — determines the "writes to" label */
  configType?: "plugins" | "hooks" | "mcp" | "skills";
  onClear?: () => void;
};

const CONFIG_FILES: Record<string, { global: string; project: (p: string) => string }> = {
  plugins: {
    global: "~/.claude/settings.json",
    project: (p) => `${p}/.claude/settings.json`,
  },
  hooks: {
    global: "~/.claude/settings.json",
    project: (p) => `${p}/.claude/settings.json`,
  },
  mcp: {
    global: "~/.claude.json",
    project: (p) => `${p}/.mcp.json`,
  },
  skills: {
    global: "~/.claude/settings.json",
    project: (p) => `${p}/.claude/settings.json`,
  },
};

const shortenPath = (path: string): string =>
  path.replace(/^\/Users\/[^/]+\//, "~/");

const GlobalBadge = ({ targetFile }: { targetFile?: string }) => {
  return (
    <div className="flex items-center gap-3 rounded-lg bg-[var(--overlay-subtle)] px-4 py-2">
      <div className="flex items-center gap-2">
        <span className="text-zinc-500"><GlobeIcon /></span>
        <span className="text-xs font-medium text-zinc-400">Global</span>
      </div>
      {targetFile && (
        <span className="font-mono text-xs text-zinc-500">
          writes to {targetFile}
        </span>
      )}
    </div>
  );
};

const ProjectBadge = ({
  name,
  targetFile,
  onClear,
}: {
  name: string;
  targetFile?: string;
  onClear?: () => void;
}) => {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-blue-500/10 px-4 py-2 shadow-[inset_0_0_0_1px_rgba(59,130,246,0.2)]">
      <div className="flex items-center gap-2">
        <span className="text-blue-400"><FolderIcon /></span>
        <span className="text-xs font-medium text-blue-300">{name}</span>
        <span className="text-xs text-blue-400/60">project overrides</span>
      </div>
      {targetFile && (
        <span className="font-mono text-xs text-blue-400/40">
          writes to {shortenPath(targetFile)}
        </span>
      )}
      {onClear && (
        <button
          onClick={onClear}
          className="relative ml-auto flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-blue-400/60 transition-snappy hover:bg-blue-400/10 hover:text-blue-300 active:scale-[0.96] before:absolute before:-inset-2.5 before:content-['']"
          title="Return to global view"
        >
          <XIcon size={12} />
        </button>
      )}
    </div>
  );
};

export const ScopeBanner = ({ projectPath, configType, onClear }: ScopeBannerProps) => {
  const projectName = getProjectDisplayName(projectPath);
  const fileConfig = configType ? CONFIG_FILES[configType] : undefined;

  if (!projectName) {
    return <GlobalBadge targetFile={fileConfig?.global} />;
  }

  const targetFile = fileConfig && projectPath
    ? fileConfig.project(projectPath)
    : undefined;

  return <ProjectBadge name={projectName} targetFile={targetFile} onClear={onClear} />;
};
