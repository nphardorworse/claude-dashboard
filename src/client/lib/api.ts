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
  const segments = projectPath.replace(/[/\\]+$/, "").split(/[/\\]/);
  return segments[segments.length - 1] || projectPath;
};

// ── Auth token management ───────────────────────────────────

let authToken: string | null = null;
let tokenPromise: Promise<string> | null = null;

const fetchToken = async (): Promise<string> => {
  try {
    const res = await fetch("/api/auth/token");
    if (!res.ok) throw new Error("Failed to fetch auth token");
    const data = (await res.json()) as { token: string };
    authToken = data.token;
    return authToken;
  } catch (err) {
    tokenPromise = null; // Allow retry on next call
    throw err;
  }
};

export const getAuthToken = (): Promise<string> => {
  if (authToken) return Promise.resolve(authToken);
  if (!tokenPromise) tokenPromise = fetchToken();
  return tokenPromise;
};

/**
 * Authenticated fetch wrapper. Automatically attaches the Bearer token
 * to mutation requests (POST, PUT, DELETE).
 */
export const apiFetch = async (
  url: string,
  init?: RequestInit
): Promise<Response> => {
  const method = init?.method?.toUpperCase() ?? "GET";
  const headers = new Headers(init?.headers);

  if (method !== "GET" && method !== "HEAD") {
    const token = await getAuthToken();
    headers.set("Authorization", `Bearer ${token}`);
  }

  return fetch(url, { ...init, headers });
};
