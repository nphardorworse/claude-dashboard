import { useState, useCallback } from "react";

const STORAGE_KEY = "claude-dashboard-selected-project";

const readStoredProject = (): string | null => {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
};

const writeStoredProject = (path: string | null): void => {
  try {
    if (path === null) {
      localStorage.removeItem(STORAGE_KEY);
    } else {
      localStorage.setItem(STORAGE_KEY, path);
    }
  } catch {
    // localStorage unavailable — ignore
  }
};

export const useProject = () => {
  const [projectPath, setProjectPath] = useState<string | null>(
    readStoredProject
  );

  const setProject = useCallback((path: string | null) => {
    writeStoredProject(path);
    setProjectPath(path);
  }, []);

  return { projectPath, setProject };
};
