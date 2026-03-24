export const buildScopedUrl = (
  baseUrl: string,
  projectPath: string | null
): string => {
  if (!projectPath) return baseUrl;
  const separator = baseUrl.includes("?") ? "&" : "?";
  return `${baseUrl}${separator}project=${btoa(projectPath)}`;
};

export const getProjectDisplayName = (
  projectPath: string | null
): string | null => {
  if (!projectPath) return null;
  const segments = projectPath.replace(/\/+$/, "").split("/");
  return segments[segments.length - 1] || projectPath;
};
