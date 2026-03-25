/**
 * In-process async mutex for serializing read-modify-write cycles on the same file.
 * Does NOT protect against external processes (e.g. Claude Code writing ~/.claude.json).
 */
const locks = new Map<string, Promise<void>>();

export const withFileLock = async <T>(
  path: string,
  fn: () => Promise<T>
): Promise<T> => {
  const prev = locks.get(path) ?? Promise.resolve();
  let release!: () => void;
  const next = new Promise<void>((resolve) => {
    release = resolve;
  });
  locks.set(path, prev.then(() => next));
  await prev;
  try {
    return await fn();
  } finally {
    release();
  }
};
