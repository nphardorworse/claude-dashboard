import { readFile, writeFile, mkdir, rename, copyFile } from "fs/promises";
import { join, basename } from "path";
import { PATHS } from "./paths";

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
      // "Unexpected non-whitespace character after JSON at position 1234"
      // means valid JSON exists but has trailing content (e.g. extra bracket) — recover it
      const posMatch = /after JSON at position (\d+)/.exec(err.message);
      if (posMatch) {
        try {
          return JSON.parse(trimmed.slice(0, Number(posMatch[1]))) as T;
        } catch { /* fall through */ }
      }
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
