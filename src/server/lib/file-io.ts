import { readFile, writeFile, mkdir, rename, copyFile } from "fs/promises";
import { join, basename } from "path";
import { PATHS } from "./paths";

/**
 * Escape control characters inside JSON string literals.
 */
const escapeControlCharsInStrings = (json: string): string =>
  json.replace(/"(?:[^"\\]|\\[\s\S])*"/g, (match) =>
    match.replace(/[\x01-\x1F\x7F]/g, (ch) => {
      switch (ch) {
        case "\b": return "\\b";
        case "\t": return "\\t";
        case "\n": return "\\n";
        case "\f": return "\\f";
        case "\r": return "\\r";
        default: return `\\u${ch.charCodeAt(0).toString(16).padStart(4, "0")}`;
      }
    })
  );

/**
 * Recover a JSON object from a null-byte-padded / truncated file.
 * Strips nulls, then removes lines from the end until JSON.parse succeeds.
 */
const recoverTruncatedJson = (raw: string): unknown | null => {
  const nullPos = raw.indexOf("\x00");
  if (nullPos < 0) return null;

  const lines = raw.slice(0, nullPos).split("\n");

  for (let i = lines.length; i > 0; i--) {
    const attempt = lines.slice(0, i).join("\n").trimEnd().replace(/,\s*$/, "");

    // Count unclosed braces/brackets to auto-close them
    let braces = 0, brackets = 0, inStr = false, esc = false;
    for (const ch of attempt) {
      if (esc) { esc = false; continue; }
      if (ch === "\\" && inStr) { esc = true; continue; }
      if (ch === '"') { inStr = !inStr; continue; }
      if (inStr) continue;
      if (ch === "{") braces++;
      if (ch === "}") braces--;
      if (ch === "[") brackets++;
      if (ch === "]") brackets--;
    }

    const closing =
      "]".repeat(Math.max(0, brackets)) +
      "}".repeat(Math.max(0, braces));
    try {
      return JSON.parse(attempt + closing);
    } catch { continue; }
  }

  return null;
};

export const readJsonFile = async <T = unknown>(
  path: string
): Promise<T | null> => {
  let raw: string;
  try {
    raw = await readFile(path, "utf-8");
  } catch (err: unknown) {
    if (err instanceof Error && (err as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw err;
  }

  const trimmed = raw.trim();
  if (!trimmed) return null;

  try {
    return JSON.parse(trimmed) as T;
  } catch (err: unknown) {
    if (err instanceof SyntaxError) {
      // Recovery 1: trailing content after valid JSON (e.g. extra bracket)
      const posMatch = /after JSON at position (\d+)/.exec(err.message);
      if (posMatch) {
        try {
          return JSON.parse(trimmed.slice(0, Number(posMatch[1]))) as T;
        } catch { /* fall through */ }
      }

      // Recovery 2: escape control characters in string literals
      try {
        return JSON.parse(escapeControlCharsInStrings(trimmed)) as T;
      } catch { /* fall through */ }

      // Recovery 3: null-byte-padded / truncated file — strip nulls,
      // remove incomplete trailing lines, and close brackets
      const recovered = recoverTruncatedJson(trimmed);
      if (recovered !== null) return recovered as T;

      console.warn(`[file-io] Malformed JSON in ${path}: ${err.message}. Treating as empty.`);
      return null;
    }
    throw err;
  }
};

export const ensureDir = async (dirPath: string): Promise<void> => {
  await mkdir(dirPath, { recursive: true });
};

export const createBackup = async (filePath: string): Promise<void> => {
  try {
    await readFile(filePath);
  } catch (err: unknown) {
    if (err && typeof err === "object" && "code" in err && (err as NodeJS.ErrnoException).code === "ENOENT") {
      return; // File doesn't exist, nothing to back up
    }
    console.error(`[file-io] Failed to read ${filePath} for backup:`, err);
    throw err;
  }

  await ensureDir(PATHS.backupsDir);
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupName = `${basename(filePath)}.${timestamp}.bak`;
  const backupPath = join(PATHS.backupsDir, backupName);
  await copyFile(filePath, backupPath);
};

export const writeJsonFile = async (
  path: string,
  data: unknown
): Promise<void> => {
  await createBackup(path);

  const tmpPath = `${path}.tmp`;
  await writeFile(tmpPath, `${JSON.stringify(data, null, 2)  }\n`, "utf-8");
  await rename(tmpPath, path);
};
