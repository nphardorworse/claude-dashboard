import { createReadStream, createWriteStream } from "fs";
import { constants as fsConstants } from "fs";
import { copyFile, mkdir, open, readdir, readFile, rename, stat, unlink, writeFile } from "fs/promises";
import { join } from "path";
import { pipeline } from "stream/promises";
import { PATHS } from "./paths";
import { withFileLock } from "./file-lock";
import { readJsonlLines } from "./jsonl-stream";
import {
  createTranscriptBuilder,
  isConversationEntry,
  loadTranscriptFromFile,
  parseTranscriptFromJsonl,
  type JsonlEntry,
} from "./transcript-parser";
import type { SnapshotMeta, TranscriptResponse } from "../../shared/types";

/**
 * Snapshot storage under ~/.claude/dashboard-snapshots/.
 *
 * Schema 2 (written now): `<id>.meta.json` holds `{ schema: 2, meta }` and
 * `<id>.jsonl` holds the session copy. Every read and write of the jsonl
 * streams, so a snapshot of any size never sits in memory whole. The meta
 * file is renamed into place last, so a listed snapshot is always complete.
 *
 * Schema 1 (legacy, still readable): `<id>.json` holds `{ schema: 1, meta, raw }`
 * with the session embedded as one string. Those were only ever written for
 * sessions small enough to stringify, so reading one whole stays bounded.
 * Schema 1 is also the portable export/import format.
 */

export type PortableSnapshot = { schema: 1; meta: SnapshotMeta; raw: string };

export type StoredSnapshot =
  | { schema: 2; meta: SnapshotMeta; jsonlPath: string }
  | { schema: 1; meta: SnapshotMeta; raw: string };

/** Largest jsonl we export as one JSON file. Escaping inflates it, and the
 * result must still fit in one V8 string (~512M chars) to be parsed again. */
export const MAX_EXPORT_BYTES = 256 * 1024 * 1024;

const META_SUFFIX = ".meta.json";
const LEGACY_META_PEEK_BYTES = 64 * 1024;
// JSON.stringify(file, null, 2) puts the top-level raw key on its own line.
const LEGACY_RAW_KEY = '\n  "raw": ';

export const snapshotFiles = (id: string) => ({
  meta: join(PATHS.snapshotsDir, `${id}${META_SUFFIX}`),
  jsonl: join(PATHS.snapshotsDir, `${id}.jsonl`),
  legacy: join(PATHS.snapshotsDir, `${id}.json`),
});

export const buildSnapshotId = (sessionId: string, createdAt: string): string => {
  // ISO timestamp + sessionId prefix, sanitized for filesystem use.
  const ts = createdAt.replace(/[:.]/g, "-");
  const safeSid = sessionId.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 32);
  return `${ts}__${safeSid}`;
};

const isEnoent = (err: unknown): boolean =>
  (err as NodeJS.ErrnoException)?.code === "ENOENT";

const exists = async (filePath: string): Promise<boolean> => {
  try {
    await stat(filePath);
    return true;
  } catch (err) {
    if (isEnoent(err)) return false;
    throw err;
  }
};

/** Remove a file, reporting whether it was there. */
const removeFile = async (filePath: string): Promise<boolean> => {
  try {
    await unlink(filePath);
    return true;
  } catch (err) {
    if (isEnoent(err)) return false;
    throw err;
  }
};

/** Backfill fields absent in older snapshot files and reject meta-less ones. */
const normalizeMeta = (meta: unknown, filePath: string): SnapshotMeta => {
  if (!meta || typeof meta !== "object") {
    throw new Error(`Snapshot file missing meta: ${filePath}`);
  }
  const m = meta as SnapshotMeta;
  return { ...m, sessionName: m.sessionName ?? "", conversationOnly: m.conversationOnly ?? false };
};

const readMetaFile = async (filePath: string): Promise<SnapshotMeta> => {
  const parsed = JSON.parse(await readFile(filePath, "utf-8")) as { meta?: unknown };
  return normalizeMeta(parsed?.meta, filePath);
};

const readLegacyFile = async (filePath: string): Promise<PortableSnapshot> => {
  const parsed = JSON.parse(await readFile(filePath, "utf-8")) as Partial<PortableSnapshot>;
  if (typeof parsed?.raw !== "string") {
    throw new Error(`Snapshot file missing raw: ${filePath}`);
  }
  return { schema: 1, meta: normalizeMeta(parsed.meta, filePath), raw: parsed.raw };
};

/**
 * Read a schema 1 file's meta without parsing its embedded session: meta is
 * written before raw, so it sits in the first few KB. Falls back to a full
 * parse for files not laid out the way this server writes them.
 */
const readLegacyMeta = async (filePath: string): Promise<SnapshotMeta> => {
  const handle = await open(filePath, "r");
  let head: string;
  try {
    const buf = Buffer.alloc(LEGACY_META_PEEK_BYTES);
    const { bytesRead } = await handle.read(buf, 0, buf.length, 0);
    head = buf.subarray(0, bytesRead).toString("utf-8");
  } finally {
    await handle.close();
  }
  const rawKeyAt = head.indexOf(LEGACY_RAW_KEY);
  if (rawKeyAt !== -1) {
    try {
      const prefix = head.slice(0, rawKeyAt).replace(/,\s*$/, "");
      const parsed = JSON.parse(`${prefix}\n}`) as { meta?: unknown };
      return normalizeMeta(parsed.meta, filePath);
    } catch {
      // Unexpected layout; fall through to the full parse.
    }
  }
  return (await readLegacyFile(filePath)).meta;
};

/** Open a snapshot by id, either schema. Null if it does not exist. */
export const openSnapshot = async (id: string): Promise<StoredSnapshot | null> => {
  const files = snapshotFiles(id);
  try {
    return { schema: 2, meta: await readMetaFile(files.meta), jsonlPath: files.jsonl };
  } catch (err) {
    if (!isEnoent(err)) throw err;
  }
  try {
    return await readLegacyFile(files.legacy);
  } catch (err) {
    if (isEnoent(err)) return null;
    throw err;
  }
};

/** All snapshot metas, newest first. Reads only meta, never a session copy. */
export const listSnapshotMetas = async (): Promise<SnapshotMeta[]> => {
  let names: string[];
  try {
    names = await readdir(PATHS.snapshotsDir);
  } catch (err) {
    if (isEnoent(err)) return [];
    throw err;
  }

  const metas: SnapshotMeta[] = [];
  for (const name of names) {
    if (!name.endsWith(".json")) continue;
    const filePath = join(PATHS.snapshotsDir, name);
    try {
      metas.push(
        name.endsWith(META_SUFFIX) ? await readMetaFile(filePath) : await readLegacyMeta(filePath),
      );
    } catch (err) {
      if (isEnoent(err)) continue; // deleted while listing
      console.error(`[snapshot-store] skipping corrupt snapshot ${name}:`, err);
    }
  }
  metas.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return metas;
};

/** The snapshot's JSONL, one trimmed non-empty line at a time. */
async function* snapshotLines(snap: StoredSnapshot): AsyncGenerator<string> {
  if (snap.schema === 2) {
    yield* readJsonlLines(snap.jsonlPath);
    return;
  }
  for (const line of snap.raw.split("\n")) {
    const trimmed = line.trim();
    if (trimmed) yield trimmed;
  }
}

export const loadSnapshotTranscript = (snap: StoredSnapshot): Promise<TranscriptResponse> => {
  const { sessionId, projectPath } = snap.meta;
  return snap.schema === 2
    ? loadTranscriptFromFile(snap.jsonlPath, sessionId, projectPath)
    : Promise.resolve(parseTranscriptFromJsonl(snap.raw, sessionId, projectPath));
};

/**
 * Write a new schema 2 snapshot. `fill` writes the session copy to the temp
 * path it is given and returns the meta. Null if the id is already taken.
 */
const commitSnapshot = async (
  id: string,
  fill: (tmpJsonl: string) => Promise<SnapshotMeta>,
): Promise<SnapshotMeta | null> => {
  await mkdir(PATHS.snapshotsDir, { recursive: true });
  const files = snapshotFiles(id);
  return withFileLock(files.meta, async () => {
    // Snapshots are immutable: never reuse an id.
    for (const filePath of [files.meta, files.jsonl, files.legacy]) {
      if (await exists(filePath)) return null;
    }
    const tmpJsonl = `${files.jsonl}.tmp`;
    const tmpMeta = `${files.meta}.tmp`;
    try {
      const meta = await fill(tmpJsonl);
      await writeFile(tmpMeta, JSON.stringify({ schema: 2, meta }, null, 2), "utf-8");
      await rename(tmpJsonl, files.jsonl);
      await rename(tmpMeta, files.meta);
      return meta;
    } catch (err) {
      for (const leftover of [tmpJsonl, tmpMeta, files.jsonl]) {
        await removeFile(leftover).catch((cleanupErr: unknown) =>
          console.error(`[snapshot-store] cleanup of ${leftover} failed:`, cleanupErr),
        );
      }
      throw err;
    }
  });
};

/**
 * Snapshot a live session file. A full snapshot is a file copy (a clone where
 * the filesystem supports it); a conversation-only one streams the session
 * through `isConversationEntry`. Either way the copy is then streamed once to
 * derive the meta stats. Null if the generated id is already taken.
 */
export const createSnapshot = async (input: {
  sourcePath: string;
  sessionId: string;
  projectPath: string;
  note: string;
  conversationOnly: boolean;
}): Promise<SnapshotMeta | null> => {
  const { sourcePath, sessionId, projectPath, note, conversationOnly } = input;
  const createdAt = new Date().toISOString();
  const id = buildSnapshotId(sessionId, createdAt);

  return commitSnapshot(id, async (tmpJsonl) => {
    const builder = createTranscriptBuilder(sessionId, projectPath);
    // Session-level facts come from every line, even ones the filter drops.
    let sessionStartTime = "";
    let sessionName = "";
    const scan = (line: string): JsonlEntry | null => {
      let entry: JsonlEntry;
      try {
        entry = JSON.parse(line);
      } catch {
        builder.markMalformed();
        return null;
      }
      if (!sessionStartTime && entry.timestamp) sessionStartTime = entry.timestamp;
      if (entry.type === "custom-title" && entry.customTitle) sessionName = entry.customTitle;
      return entry;
    };

    if (conversationOnly) {
      await pipeline(async function* () {
        for await (const line of readJsonlLines(sourcePath)) {
          const entry = scan(line);
          if (!entry || !isConversationEntry(entry)) continue;
          builder.add(entry);
          yield `${line}\n`;
        }
      }, createWriteStream(tmpJsonl));
    } else {
      await copyFile(sourcePath, tmpJsonl, fsConstants.COPYFILE_FICLONE);
      for await (const line of readJsonlLines(tmpJsonl)) {
        const entry = scan(line);
        if (entry) builder.add(entry);
      }
    }

    const sizeBytes = (await stat(tmpJsonl)).size;
    const transcript = builder.finish(sizeBytes);
    return {
      id,
      sessionId,
      sessionName,
      projectPath,
      createdAt,
      sessionStartTime,
      entryCount: transcript.entries.length,
      userMessageCount: transcript.totalUserMessages,
      assistantMessageCount: transcript.totalAssistantMessages,
      sizeBytes,
      note,
      conversationOnly,
    };
  });
};

/** Store an already validated import. `raw` is small (imports are capped). */
export const importSnapshot = async (input: {
  raw: string;
  sessionId: string;
  sessionName: string;
  projectPath: string;
  note: string;
  conversationOnly: boolean;
}): Promise<SnapshotMeta | null> => {
  const { raw, sessionId, sessionName, projectPath, note, conversationOnly } = input;
  const createdAt = new Date().toISOString();
  const id = buildSnapshotId(sessionId, createdAt);

  return commitSnapshot(id, async (tmpJsonl) => {
    await writeFile(tmpJsonl, raw, "utf-8");
    // Re-derive stats from raw so a hostile or stale meta cannot lie about
    // message counts, timestamps, or size.
    const transcript = parseTranscriptFromJsonl(raw, sessionId, projectPath);
    return {
      id,
      sessionId,
      sessionName,
      projectPath,
      createdAt,
      sessionStartTime: transcript.startTime,
      entryCount: transcript.entries.length,
      userMessageCount: transcript.totalUserMessages,
      assistantMessageCount: transcript.totalAssistantMessages,
      sizeBytes: Buffer.byteLength(raw, "utf-8"),
      note,
      conversationOnly,
    };
  });
};

/** Delete a snapshot of either schema. False if nothing was there. */
export const deleteSnapshot = async (id: string): Promise<boolean> => {
  const files = snapshotFiles(id);
  // Meta first, so a half-deleted snapshot is never listed.
  const removed = [
    await removeFile(files.meta),
    await removeFile(files.jsonl),
    await removeFile(files.legacy),
  ];
  return removed.some(Boolean);
};

/** Size in bytes of the session copy, for the export limit. */
export const snapshotJsonlBytes = async (snap: StoredSnapshot): Promise<number> =>
  snap.schema === 2
    ? (await stat(snap.jsonlPath)).size
    : Buffer.byteLength(snap.raw, "utf-8");

/**
 * The portable export (`{ schema: 1, meta, raw }`, pretty-printed like the
 * old single-file format) piece by piece, so a schema 2 jsonl is escaped
 * chunk by chunk instead of being loaded into one string.
 */
export async function* exportChunks(snap: StoredSnapshot): AsyncGenerator<string> {
  if (snap.schema === 1) {
    yield JSON.stringify({ schema: 1, meta: snap.meta, raw: snap.raw }, null, 2);
    return;
  }
  const head = JSON.stringify({ schema: 1, meta: snap.meta }, null, 2);
  // Drop the closing "\n}" and open the raw string.
  yield `${head.slice(0, -2)},${LEGACY_RAW_KEY}"`;
  // A utf-8 read stream never splits a character across chunks, so each
  // chunk escapes on its own.
  for await (const chunk of createReadStream(snap.jsonlPath, { encoding: "utf-8" })) {
    yield JSON.stringify(chunk).slice(1, -1);
  }
  yield '"\n}';
}

/**
 * Copy a snapshot into a new session file with every sessionId rewritten,
 * streaming line by line. Written to a temp file and renamed, so a failure
 * leaves no half-written session behind.
 */
export const writeSpawnedSession = async (
  snap: StoredSnapshot,
  targetPath: string,
  newSessionId: string,
): Promise<void> => {
  const tmpPath = `${targetPath}.tmp`;
  try {
    await pipeline(async function* () {
      for await (const line of snapshotLines(snap)) {
        let entry: unknown;
        try {
          entry = JSON.parse(line);
        } catch {
          // Mixed sessionIds would corrupt the spawned session.
          throw new Error(
            "Snapshot contains unparseable JSONL; spawn aborted to avoid sessionId corruption",
          );
        }
        if (entry && typeof entry === "object" && "sessionId" in entry && entry.sessionId) {
          (entry as { sessionId: string }).sessionId = newSessionId;
        }
        yield `${JSON.stringify(entry)}\n`;
      }
    }, createWriteStream(tmpPath, { flags: "wx" }));
    await rename(tmpPath, targetPath);
  } catch (err) {
    await removeFile(tmpPath).catch(() => undefined);
    throw err;
  }
};
