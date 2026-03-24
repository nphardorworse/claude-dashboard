import { useState, useEffect, useCallback, useMemo } from "react";
import type { ProjectInfo } from "../../../shared/types";

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

const ProjectOption = ({ project }: { project: ProjectInfo }) => {
  return (
    <option value={project.path} title={project.path}>
      {project.name}
    </option>
  );
};

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
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const value = e.target.value;
      onSelect(value === "" ? null : value);
    },
    [onSelect]
  );

  const selectedLabel = useMemo(() => {
    if (!projectPath) return null;
    const found = projects.find((p) => p.path === projectPath);
    return found?.path ?? null;
  }, [projectPath, projects]);

  return (
    <div className="px-4 py-3 border-b border-zinc-800">
      <label className="mb-1.5 block text-xs font-medium text-zinc-500">
        Scope
      </label>
      <select
        value={projectPath ?? ""}
        onChange={handleChange}
        className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-2.5 py-1.5 text-sm text-zinc-200 outline-none focus:border-blue-500"
        title={selectedLabel ?? "Global settings"}
      >
        <option value="">Global</option>
        {projects.map((project) => (
          <ProjectOption key={project.path} project={project} />
        ))}
      </select>
      {projectPath && (
        <p className="mt-1 truncate text-[10px] text-zinc-600" title={projectPath}>
          {projectPath}
        </p>
      )}
    </div>
  );
};
