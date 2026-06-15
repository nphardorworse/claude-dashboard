import { existsSync } from "fs";
import { homedir } from "os";
import { join } from "path";

let cachedBin: string | null = null;

/**
 * Resolve the `claude` CLI binary. The dashboard server may run with a minimal
 * PATH that omits ~/.local/bin (where Claude Code commonly installs), so probe
 * the usual locations before falling back to bare "claude" on PATH.
 * Override with CLAUDE_BIN if it lives somewhere unusual.
 */
export const resolveClaudeBin = (): string => {
  if (cachedBin) return cachedBin;

  const candidates = [
    process.env.CLAUDE_BIN,
    join(homedir(), ".local", "bin", "claude"),
    "/opt/homebrew/bin/claude",
    "/usr/local/bin/claude",
  ].filter((c): c is string => Boolean(c));

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      cachedBin = candidate;
      return candidate;
    }
  }

  cachedBin = "claude"; // last resort: rely on PATH
  return cachedBin;
};
