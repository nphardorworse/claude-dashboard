import { useCallback } from "react";
import { Sidebar } from "./components/layout/Sidebar";
import { OverviewPage } from "./components/overview/OverviewPage";
import { PluginsPage } from "./components/plugins/PluginsPage";
import { SkillsPage } from "./components/skills/SkillsPage";
import { ProfilesPage } from "./components/profiles/ProfilesPage";
import { McpPage } from "./components/mcp/McpPage";
import { HooksPage } from "./components/hooks-manager/HooksPage";
import { UsagePage } from "./components/usage/UsagePage";
import { TranscriptsPage } from "./components/transcripts/TranscriptsPage";
import { HowItWorksPage } from "./components/how-it-works/HowItWorksPage";
import { useRoute } from "./hooks/use-route";
import { useProject } from "./hooks/use-project";
import { useTheme } from "./hooks/use-theme";

type PageRouterProps = {
  projectPath: string | null;
  onClearProject: () => void;
  onSelectProject: (path: string) => void;
};

const PageRouter = ({ projectPath, onClearProject, onSelectProject }: PageRouterProps) => {
  const route = useRoute();

  if (route === "/plugins") return <PluginsPage projectPath={projectPath} onClearProject={onClearProject} />;
  if (route === "/skills") return <SkillsPage projectPath={projectPath} onClearProject={onClearProject} />;
  if (route === "/mcp") return <McpPage projectPath={projectPath} onClearProject={onClearProject} />;
  if (route === "/hooks") return <HooksPage projectPath={projectPath} onClearProject={onClearProject} />;
  if (route === "/profiles") return <ProfilesPage projectPath={projectPath} onClearProject={onClearProject} />;
  if (route === "/usage") return <UsagePage projectPath={projectPath} onClearProject={onClearProject} />;
  if (route === "/transcripts") return <TranscriptsPage projectPath={projectPath} onClearProject={onClearProject} />;
  if (route === "/how-it-works") return <HowItWorksPage />;
  return <OverviewPage projectPath={projectPath} onClearProject={onClearProject} onSelectProject={onSelectProject} />;
};

export const App = () => {
  const { projectPath, setProject } = useProject();
  const { isDark, toggleTheme } = useTheme();

  const handleSelectProject = useCallback(
    (path: string | null) => {
      setProject(path);
    },
    [setProject]
  );

  const handleClearProject = useCallback(() => {
    setProject(null);
  }, [setProject]);

  return (
    <div className="flex h-screen">
      <Sidebar
        projectPath={projectPath}
        onSelectProject={handleSelectProject}
        isDark={isDark}
        onToggleTheme={toggleTheme}
      />
      <main className="flex-1 overflow-y-auto">
        <PageRouter projectPath={projectPath} onClearProject={handleClearProject} onSelectProject={handleSelectProject} />
      </main>
    </div>
  );
};
