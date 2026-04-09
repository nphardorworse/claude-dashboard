import { Hono } from "hono";
import { readdir, readFile, stat, writeFile, unlink, mkdir } from "fs/promises";
import { join } from "path";
import { PATHS, getProjectPath } from "../lib/paths";
import { loadTranscript, parseTranscriptFromJsonl } from "../lib/transcript-parser";
import { withFileLock } from "../lib/file-lock";
import type {
  SnapshotDetailResponse,
  SnapshotListResponse,
  SnapshotMeta,
  TranscriptResponse,
} from "../../shared/types";

/**
 * Transcripts & snapshots route.
 *
 * - GET /api/transcripts/session/:sessionId
 *     Full readable transcript for a live session (parsed from the JSONL on disk).
 *
 * - POST /api/transcripts/snapshots
 *     Body: { sessionId, projectPath, note? }
 *     Saves an immutable copy of the session JSONL to ~/.claude/dashboard-snapshots/
 *     so the pre-compaction text is preserved even if the live session rotates,
 *     compacts, or is deleted.
 *
 * - GET /api/transcripts/snapshots
 *     List all saved snapshots (optionally filtered by project scope).
 *
 * - GET /api/transcripts/snapshots/:id
 *     Load a snapshot's transcript by ID.
 *
 * - DELETE /api/transcripts/snapshots/:id
 *     Delete a saved snapshot.
 */

const SNAPSHOT_ID_RE = /^[a-zA-Z0-9_-]+$/;
const MAX_NOTE_LENGTH = 500;

type SnapshotFile = {
  schema: 1;
  meta: SnapshotMeta;
  raw: string;
};

const ensureSnapshotsDir = async (): Promise<void> => {
  await mkdir(PATHS.snapshotsDir, { recursive: true });
};

const buildSnapshotId = (sessionId: string, createdAt: string): string => {
  // ISO timestamp + sessionId prefix, sanitized for filesystem use.
  const ts = createdAt.replace(/[:.]/g, "-");
  const safeSid = sessionId.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 32);
  return `${ts}__${safeSid}`;
};

const validateSnapshotId = (
  id: unknown,
): { valid: true; value: string } | { valid: false; error: string } => {
  if (typeof id !== "string" || !id) {
    return { valid: false, error: "Snapshot id is required" };
  }
  if (id.length > 200) {
    return { valid: false, error: "Snapshot id too long" };
  }
  if (!SNAPSHOT_ID_RE.test(id)) {
    return { valid: false, error: "Snapshot id contains invalid characters" };
  }
  return { valid: true, value: id };
};

const readSnapshotFile = async (
  filePath: string,
): Promise<SnapshotFile | null> => {
  try {
    const raw = await readFile(filePath, "utf-8");
    const parsed = JSON.parse(raw) as SnapshotFile;
    if (!parsed || typeof parsed !== "object" || !parsed.meta) return null;
    return parsed;
  } catch {
    return null;
  }
};

const transcripts = new Hono();

// ─── GET /session/:sessionId ───────────────────────────────
// Read the live session's full transcript from its JSONL file.
transcripts.get("/session/:sessionId", async (c) => {
  try {
    const sessionId = c.req.param("sessionId");
    if (!/^[a-zA-Z0-9_-]+$/.test(sessionId)) {
      return c.json({ error: "Invalid session id" }, 400);
    }

    const projectPath = await getProjectPath(c);
    const result = await loadTranscript(sessionId, projectPath ?? "");
    if (!result) {
      return c.json({ error: "Session JSONL not found" }, 404);
    }

    return c.json(result.transcript satisfies TranscriptResponse);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return c.json({ error: message }, 500);
  }
});

// ─── POST /snapshots ───────────────────────────────────────
// Save an immutable copy of the session's JSONL to disk.
transcripts.post("/snapshots", async (c) => {
  try {
    const body = await c.req.json<{
      sessionId?: unknown;
      projectPath?: unknown;
      note?: unknown;
    }>();

    if (typeof body.sessionId !== "string" || !body.sessionId) {
      return c.json({ error: "sessionId is required" }, 400);
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(body.sessionId)) {
      return c.json({ error: "Invalid session id" }, 400);
    }

    const projectPath =
      typeof body.projectPath === "string" ? body.projectPath : "";

    let note = "";
    if (body.note !== undefined) {
      if (typeof body.note !== "string") {
        return c.json({ error: "note must be a string" }, 400);
      }
      note = body.note.slice(0, MAX_NOTE_LENGTH);
    }

    const result = await loadTranscript(body.sessionId, projectPath);
    if (!result) {
      return c.json({ error: "Session JSONL not found" }, 404);
    }

    const createdAt = new Date().toISOString();
    const id = buildSnapshotId(body.sessionId, createdAt);

    const meta: SnapshotMeta = {
      id,
      sessionId: body.sessionId,
      projectPath: result.transcript.projectPath,
      createdAt,
      sessionStartTime: result.transcript.startTime,
      entryCount: result.transcript.entries.length,
      userMessageCount: result.transcript.totalUserMessages,
      assistantMessageCount: result.transcript.totalAssistantMessages,
      sizeBytes: result.transcript.rawBytes,
      note,
    };

    const snapshot: SnapshotFile = {
      schema: 1,
      meta,
      raw: result.raw,
    };

    await ensureSnapshotsDir();
    const filePath = join(PATHS.snapshotsDir, `${id}.json`);

    return await withFileLock(filePath, async () => {
      const tmpPath = `${filePath}.tmp`;
      await writeFile(tmpPath, JSON.stringify(snapshot, null, 2), "utf-8");
      // Atomic rename via writeFile-then-rename isn't strictly needed here
      // because the file is new, but keep the .tmp pattern for consistency.
      const { rename } = await import("fs/promises");
      await rename(tmpPath, filePath);
      return c.json({ meta } satisfies { meta: SnapshotMeta });
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return c.json({ error: message }, 500);
  }
});

// ─── GET /snapshots ────────────────────────────────────────
// List all saved snapshots, optionally filtered by project scope.
transcripts.get("/snapshots", async (c) => {
  try {
    const projectPath = await getProjectPath(c);

    let files: string[];
    try {
      files = await readdir(PATHS.snapshotsDir);
    } catch (err: unknown) {
      if (
        err &&
        typeof err === "object" &&
        "code" in err &&
        (err as NodeJS.ErrnoException).code === "ENOENT"
      ) {
        return c.json({ snapshots: [] } satisfies SnapshotListResponse);
      }
      throw err;
    }

    const jsonFiles = files.filter((f) => f.endsWith(".json"));

    const metas: SnapshotMeta[] = [];
    for (const file of jsonFiles) {
      const filePath = join(PATHS.snapshotsDir, file);
      const parsed = await readSnapshotFile(filePath);
      if (!parsed) continue;
      if (projectPath && parsed.meta.projectPath !== projectPath) continue;
      metas.push(parsed.meta);
    }

    metas.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );

    return c.json({ snapshots: metas } satisfies SnapshotListResponse);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return c.json({ error: message }, 500);
  }
});

// ─── GET /snapshots/:id ────────────────────────────────────
// Load a snapshot's full transcript.
transcripts.get("/snapshots/:id", async (c) => {
  try {
    const idCheck = validateSnapshotId(c.req.param("id"));
    if (!idCheck.valid) return c.json({ error: idCheck.error }, 400);

    const filePath = join(PATHS.snapshotsDir, `${idCheck.value}.json`);
    try {
      await stat(filePath);
    } catch {
      return c.json({ error: "Snapshot not found" }, 404);
    }

    const parsed = await readSnapshotFile(filePath);
    if (!parsed) {
      return c.json({ error: "Snapshot corrupted or unreadable" }, 500);
    }

    const transcript = parseTranscriptFromJsonl(
      parsed.raw,
      parsed.meta.sessionId,
      parsed.meta.projectPath,
    );

    return c.json({
      meta: parsed.meta,
      transcript,
    } satisfies SnapshotDetailResponse);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return c.json({ error: message }, 500);
  }
});

// ─── DELETE /snapshots/:id ─────────────────────────────────
transcripts.delete("/snapshots/:id", async (c) => {
  try {
    const idCheck = validateSnapshotId(c.req.param("id"));
    if (!idCheck.valid) return c.json({ error: idCheck.error }, 400);

    const filePath = join(PATHS.snapshotsDir, `${idCheck.value}.json`);
    try {
      await unlink(filePath);
    } catch (err: unknown) {
      if (
        err &&
        typeof err === "object" &&
        "code" in err &&
        (err as NodeJS.ErrnoException).code === "ENOENT"
      ) {
        return c.json({ error: "Snapshot not found" }, 404);
      }
      throw err;
    }

    return c.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return c.json({ error: message }, 500);
  }
});

export { transcripts };
