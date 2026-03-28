import { readFile, writeFile, mkdir, rename, copyFile } from "fs/promises";
import { join, basename } from "path";
import { PATHS } from "./paths";

export const readJsonFile = async <T = unknown>(
  path: string
): Promise<T | null> => {
  try {
    const raw = await readFile(path, "utf-8");
    const trimmed = raw.trim();
    if (!trimmed) return null;
    return JSON.parse(trimmed) as T;
  } catch (err: unknown) {
    if (err instanceof Error && (err as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    if (err instanceof SyntaxError) {
      // Malformed JSON — treat as empty
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
  } catch {
    // File doesn't exist yet — nothing to back up
    return;
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
