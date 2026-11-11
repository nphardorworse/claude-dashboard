import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { stream } from "hono/streaming";
import { mkdir } from "fs/promises";
import { join } from "path";
import {
  getProjectPath,
  getProjectSessionsDir,
  resolveSessionFilePath,
  validateProjectPath,
} from "../lib/paths";
import { loadTranscript } from "../lib/transcript-parser";
import {
  MAX_EXPORT_BYTES,
  createSnapshot,
  deleteSnapshot,
  exportChunks,
  importSnapshot,
  listSnapshotMetas,
  loadSnapshotTranscript,
  openSnapshot,
  snapshotJsonlBytes,
  writeSpawnedSession,
  type PortableSnapshot,
} from "../lib/snapshot-store";
import type {
  SnapshotDetailResponse,
  SnapshotListResponse,
  SnapshotMeta,
  TranscriptResponse,
} from "../../shared/types";

/**
 * Transcripts & snapshots route: read live session transcripts and manage
 * immutable snapshots (storage lives in lib/snapshot-store).
 */

const MAX_IMPORT_BYTES = 32 * 1024 * 1024;

const SNAPSHOT_ID_RE = /^[a-zA-Z0-9_-]+$/;
const MAX_NOTE_LENGTH = 500;

const mb = (n: number) => Math.round(n / 1024 / 1024);

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

const transcripts = new Hono();

transcripts.get("/session/:sessionId", async (c) => {
  try {
    const sessionId = c.req.param("sessionId");
    if (!/^[a-zA-Z0-9_-]+$/.test(sessionId)) {
      return c.json({ error: "Invalid session id" }, 400);
    }

    const projectPath = await getProjectPath(c);
    const transcript = await loadTranscript(sessionId, projectPath ?? "");
    if (!transcript) {
      return c.json({ error: "Session JSONL not found" }, 404);
    }

    return c.json(transcript satisfies TranscriptResponse);
  } catch (err) {
    console.error("GET /api/transcripts/session/:sessionId error:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return c.json({ error: message }, 500);
  }
});

// POST /snapshots: save an immutable copy of the session's JSONL to disk.
// Body: { sessionId, projectPath, note?, conversationOnly? }
transcripts.post("/snapshots", async (c) => {
  try {
    const body = await c.req.json<{
      sessionId?: unknown;
      projectPath?: unknown;
      note?: unknown;
      conversationOnly?: unknown;
    }>();

    if (typeof body.sessionId !== "string" || !body.sessionId) {
      return c.json({ error: "sessionId is required" }, 400);
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(body.sessionId)) {
      return c.json({ error: "Invalid session id" }, 400);
    }

    const projectPath =
      typeof body.projectPath === "string" ? body.projectPath : "";
    const conversationOnly = body.conversationOnly === true;

    let note = "";
    if (body.note !== undefined) {
      if (typeof body.note !== "string") {
        return c.json({ error: "note must be a string" }, 400);
      }
      note = body.note.slice(0, MAX_NOTE_LENGTH);
    }

    const sessionFile = await resolveSessionFilePath(body.sessionId, projectPath);
    if (!sessionFile) {
      return c.json({ error: "Session JSONL not found" }, 404);
    }

    let meta: SnapshotMeta | null;
    try {
      meta = await createSnapshot({
        sourcePath: sessionFile,
        sessionId: body.sessionId,
        projectPath,
        note,
        conversationOnly,
      });
    } catch (err) {
      if ((err as NodeJS.ErrnoException)?.code === "ENOENT") {
        return c.json({ error: "Session JSONL not found" }, 404);
      }
      throw err;
    }
    if (!meta) {
      return c.json({ error: "A snapshot with this ID already exists" }, 409);
    }
    return c.json({ meta } satisfies { meta: SnapshotMeta });
  } catch (err) {
    console.error("POST /api/transcripts/snapshots error:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return c.json({ error: message }, 500);
  }
});

// GET /snapshots: list all saved snapshots, optionally filtered by project scope.
transcripts.get("/snapshots", async (c) => {
  try {
    const projectPath = await getProjectPath(c);
    const all = await listSnapshotMetas();
    const metas = projectPath ? all.filter((m) => m.projectPath === projectPath) : all;
    return c.json({ snapshots: metas } satisfies SnapshotListResponse);
  } catch (err) {
    console.error("GET /api/transcripts/snapshots error:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return c.json({ error: message }, 500);
  }
});

// GET /snapshots/:id: load a snapshot's full transcript.
transcripts.get("/snapshots/:id", async (c) => {
  try {
    const idCheck = validateSnapshotId(c.req.param("id"));
    if (!idCheck.valid) return c.json({ error: idCheck.error }, 400);

    const snap = await openSnapshot(idCheck.value);
    if (!snap) {
      return c.json({ error: "Snapshot not found" }, 404);
    }

    return c.json({
      meta: snap.meta,
      transcript: await loadSnapshotTranscript(snap),
    } satisfies SnapshotDetailResponse);
  } catch (err) {
    console.error("GET /api/transcripts/snapshots/:id error:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return c.json({ error: message }, 500);
  }
});

transcripts.delete("/snapshots/:id", async (c) => {
  try {
    const idCheck = validateSnapshotId(c.req.param("id"));
    if (!idCheck.valid) return c.json({ error: idCheck.error }, 400);

    if (!(await deleteSnapshot(idCheck.value))) {
      return c.json({ error: "Snapshot not found" }, 404);
    }

    return c.json({ ok: true });
  } catch (err) {
    console.error("DELETE /api/transcripts/snapshots/:id error:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return c.json({ error: message }, 500);
  }
});

// GET /snapshots/:id/export: download a snapshot as a portable JSON file.
transcripts.get("/snapshots/:id/export", async (c) => {
  try {
    const idCheck = validateSnapshotId(c.req.param("id"));
    if (!idCheck.valid) return c.json({ error: idCheck.error }, 400);

    const snap = await openSnapshot(idCheck.value);
    if (!snap) {
      return c.json({ error: "Snapshot not found" }, 404);
    }

    const bytes = await snapshotJsonlBytes(snap);
    if (bytes > MAX_EXPORT_BYTES) {
      return c.json(
        {
          error: `This snapshot is ${mb(bytes)} MB, too large to export as one JSON file (limit ${mb(MAX_EXPORT_BYTES)} MB).`,
        },
        413,
      );
    }

    const { sessionId, createdAt } = snap.meta;
    const rawName = `snapshot-${sessionId.slice(0, 8)}-${createdAt.replace(/[:.]/g, "-")}.json`;
    const fileName = rawName.replace(/[^A-Za-z0-9._-]/g, "");
    c.header("Content-Type", "application/json");
    c.header("Content-Disposition", `attachment; filename="${fileName}"`);
    return stream(
      c,
      async (out) => {
        for await (const chunk of exportChunks(snap)) {
          if (out.aborted) return;
          await out.write(chunk);
        }
      },
      async (err) => {
        console.error("GET /api/transcripts/snapshots/:id/export stream error:", err);
      },
    );
  } catch (err) {
    console.error("GET /api/transcripts/snapshots/:id/export error:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return c.json({ error: message }, 500);
  }
});

// POST /snapshots/import: import a snapshot from a portable JSON file.
transcripts.post(
  "/snapshots/import",
  bodyLimit({
    maxSize: MAX_IMPORT_BYTES,
    onError: (c) => c.json({ error: "Snapshot file exceeds 32MB" }, 413),
  }),
  async (c) => {
    try {
      const body = await c.req.json<unknown>();

      if (!body || typeof body !== "object") {
        return c.json({ error: "Invalid snapshot file" }, 400);
      }

      const file = body as Partial<PortableSnapshot>;
      if (!file.meta || typeof file.raw !== "string") {
        return c.json({ error: "Invalid snapshot file format" }, 400);
      }
      if (file.schema !== 1) {
        return c.json({ error: "Unsupported snapshot schema (expected 1)" }, 400);
      }
      if (
        typeof file.meta.sessionId !== "string" ||
        !SNAPSHOT_ID_RE.test(file.meta.sessionId)
      ) {
        return c.json({ error: "Invalid sessionId in snapshot meta" }, 400);
      }
      if (
        typeof file.meta.createdAt !== "string" ||
        isNaN(new Date(file.meta.createdAt).getTime())
      ) {
        return c.json({ error: "Invalid createdAt in snapshot meta" }, 400);
      }
      if (typeof file.meta.projectPath !== "string") {
        return c.json({ error: "Invalid projectPath in snapshot meta" }, 400);
      }
      const validatedProjectPath = await validateProjectPath(file.meta.projectPath);
      if (!validatedProjectPath) {
        return c.json({ error: "Unknown or invalid projectPath in snapshot meta" }, 400);
      }

      // Defense in depth against oversized payloads.
      if (Buffer.byteLength(file.raw, "utf-8") > MAX_IMPORT_BYTES) {
        return c.json({ error: "Snapshot file exceeds 32MB" }, 413);
      }

      const importedSessionId = file.meta.sessionId;
      const importedNote =
        typeof file.meta.note === "string"
          ? file.meta.note.slice(0, MAX_NOTE_LENGTH)
          : "";
      // Trust the imported conversationOnly flag; detecting by scanning raw for
      // tool_use/tool_result blocks would be more accurate but is out of scope.
      const conversationOnly = file.meta.conversationOnly === true;
      const importedSessionName =
        typeof file.meta.sessionName === "string" ? file.meta.sessionName : "";

      const note = importedNote
        ? `[imported] ${importedNote}`.slice(0, MAX_NOTE_LENGTH)
        : `[imported] originally from ${new Date(file.meta.createdAt).toLocaleString()}`.slice(
            0,
            MAX_NOTE_LENGTH,
          );

      const meta = await importSnapshot({
        raw: file.raw,
        sessionId: importedSessionId,
        sessionName: importedSessionName,
        projectPath: validatedProjectPath,
        note,
        conversationOnly,
      });
      if (!meta) {
        return c.json({ error: "A snapshot with this ID already exists" }, 409);
      }
      return c.json({ meta } satisfies { meta: SnapshotMeta });
    } catch (err) {
      console.error("POST /api/transcripts/snapshots/import error:", err);
      const message = err instanceof Error ? err.message : "Unknown error";
      return c.json({ error: message }, 500);
    }
  },
);

// POST /snapshots/:id/spawn
// Create a brand-new session (new UUID) seeded with the snapshot's JSONL,
// so `claude --resume <newId>` starts a fresh session with all the context.
// Only works with full snapshots. Conversation-only snapshots lack the
// system/progress/file-history entries Claude Code needs to resume properly.
transcripts.post("/snapshots/:id/spawn", async (c) => {
  try {
    const idCheck = validateSnapshotId(c.req.param("id"));
    if (!idCheck.valid) return c.json({ error: idCheck.error }, 400);

    const snap = await openSnapshot(idCheck.value);
    if (!snap) {
      return c.json({ error: "Snapshot not found" }, 404);
    }

    if (snap.meta.conversationOnly) {
      return c.json(
        {
          error:
            "Cannot spawn from a conversation-only snapshot. It lacks the system entries Claude Code needs to resume. Save a full snapshot first.",
        },
        400,
      );
    }

    const { randomUUID } = await import("crypto");
    const newSessionId = randomUUID();

    // Rewrite sessionId fields inside the JSONL so the session scanner
    // picks up the new ID instead of the original one.
    const sessionsDir = getProjectSessionsDir(snap.meta.projectPath);
    await mkdir(sessionsDir, { recursive: true });
    await writeSpawnedSession(snap, join(sessionsDir, `${newSessionId}.jsonl`), newSessionId);

    return c.json({
      sessionId: newSessionId,
      command: `claude --resume ${newSessionId}`,
    });
  } catch (err) {
    console.error("POST /api/transcripts/snapshots/:id/spawn error:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return c.json({ error: message }, 500);
  }
});

export { transcripts };
