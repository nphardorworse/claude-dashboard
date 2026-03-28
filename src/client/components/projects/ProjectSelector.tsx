import { useState, useEffect, useCallback, useMemo } from "react";
import type { ProjectInfo } from "../../../shared/types";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "~/client/components/ui/select";

type ProjectSelectorProps = {
  projectPath: string | null;
  onSelect: (path: string | null) => void;
};

const fetchProjects = async (): Promise<ProjectInfo[]> => {
  try {
    const res = await fetch("/api/projects");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return data.projects ?? [];
  } catch {
    return [];
  }
};

const GLOBAL_VALUE = "__global__";

export const ProjectSelector = ({
  projectPath,
  onSelect,
}: ProjectSelectorProps) => {
  const [projects, setProjects] = useState<ProjectInfo[]>([]);

  const loadProjects = useCallback(async () => {
    const data = await fetchProjects();
    setProjects(data);
  }, []);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  const handleChange = useCallback(
    (value: string) => {
      onSelect(value === GLOBAL_VALUE ? null : value);
    },
    [onSelect]
  );

  const selectedLabel = useMemo(() => {
    if (!projectPath) return null;
    const found = projects.find((p) => p.path === projectPath);
    return found?.path ?? null;
  }, [projectPath, projects]);

  return (
    <div className="px-4 py-3 border-b border-[var(--border-hairline)]">
      <label htmlFor="project-scope-select" className="mb-1.5 block text-xs font-medium text-zinc-400">
        Scope
      </label>
      <Select value={projectPath ?? GLOBAL_VALUE} onValueChange={handleChange}>
        <SelectTrigger className="w-full" title={selectedLabel ?? "Global settings"}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectItem value={GLOBAL_VALUE}>Global</SelectItem>
            {projects.map((project) => (
              <SelectItem key={project.path} value={project.path}>
                {project.name}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
      {projectPath && (
        <p className="mt-1 truncate text-[10px] text-zinc-500" dir="rtl" title={projectPath}>
          {projectPath}
        </p>
      )}
    </div>
  );
};
