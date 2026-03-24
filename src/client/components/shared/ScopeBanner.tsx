import { getProjectDisplayName } from "../../lib/api";

type ScopeBannerProps = {
  projectPath: string | null;
  /** Which config domain this page manages — determines the "writes to" label */
  configType?: "plugins" | "hooks" | "mcp";
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
};

const shortenPath = (path: string): string =>
  path.replace(/^\/Users\/[^/]+\//, "~/");

const GlobalBadge = ({ targetFile }: { targetFile?: string }) => {
  return (
    <div className="flex items-center gap-3 rounded-lg bg-zinc-800/60 px-4 py-2">
      <div className="flex items-center gap-2">
        <span className="text-xs text-zinc-500">&#127760;</span>
        <span className="text-xs font-medium text-zinc-400">Global</span>
      </div>
      {targetFile && (
        <span className="font-mono text-xs text-zinc-600">
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
    <div className="flex items-center gap-3 rounded-lg border border-blue-500/20 bg-blue-500/10 px-4 py-2">
      <div className="flex flex-1 items-center gap-2">
        <span className="text-xs text-blue-400">&#128193;</span>
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
          className="ml-auto flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-blue-400/60 transition-snappy hover:bg-blue-400/10 hover:text-blue-300"
          title="Return to global view"
        >
          &#10005;
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
