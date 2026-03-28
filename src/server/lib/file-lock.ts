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
  const chain = prev.then(() => next);
  locks.set(path, chain);
  await prev;
  try {
    return await fn();
  } finally {
    release();
    // Clean up if no other waiter queued behind us
    if (locks.get(path) === chain) locks.delete(path);
  }
};
