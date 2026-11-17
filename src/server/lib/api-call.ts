type ApiCallEntry = { requestId?: string; message?: { id?: string } };

/**
 * Claude Code writes one transcript line per content block of a reply (text,
 * thinking, each tool_use), and every one of those lines repeats the full
 * `usage` of the API call. Summing usage per line counts a call 2 to 3 times.
 *
 * Returns a filter that is true the first time it sees an API call and false
 * for its repeats. Lines without a message id are always counted. Use one
 * filter per transcript file.
 */
export const createApiCallFilter = (): ((entry: ApiCallEntry) => boolean) => {
  const seen = new Set<string>();
  return (entry) => {
    const id = entry.message?.id;
    if (!id) return true;
    const key = `${id}:${entry.requestId ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  };
};
