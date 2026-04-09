import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { readdir, readFile, rename, stat, writeFile, unlink, mkdir } from "fs/promises";
import { join } from "path";
import { PATHS, getProjectPath, getProjectSessionsDir, validateProjectPath } from "../lib/paths";
import {
  loadTranscript,
  parseTranscriptFromJsonl,
  extractSessionName,
  filterConversationJsonl,
} from "../lib/transcript-parser";
import { withFileLock } from "../lib/file-lock";
import type {
  SnapshotDetailResponse,
  SnapshotListResponse,
  SnapshotMeta,
  TranscriptResponse,
} from "../../shared/types";

/**
 * Transcripts & snapshots route — read live session transcripts and manage
 * immutable snapshot files under ~/.claude/dashboard-snapshots/.
 */

const MAX_IMPORT_BYTES = 32 * 1024 * 1024;

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
  let raw: string;
  try {
    raw = await readFile(filePath, "utf-8");
  } catch (err: unknown) {
    if (
      err &&
      typeof err === "object" &&
      "code" in err &&
      (err as NodeJS.ErrnoException).code === "ENOENT"
    ) {
      return null;
    }
    console.error(`[transcripts] readSnapshotFile failed to read ${filePath}:`, err);
    throw err;
  }
  let parsed: SnapshotFile;
  try {
    parsed = JSON.parse(raw) as SnapshotFile;
  } catch (err) {
    console.error(`[transcripts] readSnapshotFile JSON parse failed for ${filePath}:`, err);
    throw err;
  }
  if (!parsed || typeof parsed !== "object" || !parsed.meta) {
    const err = new Error(`Snapshot file missing meta: ${filePath}`);
    console.error(`[transcripts] readSnapshotFile corrupt:`, err);
    throw err;
  }
  return parsed;
};

const transcripts = new Hono();

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
    console.error("GET /api/transcripts/session/:sessionId error:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return c.json({ error: message }, 500);
  }
});

// POST /snapshots — save an immutable copy of the session's JSONL to disk.
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

    const result = await loadTranscript(body.sessionId, projectPath);
    if (!result) {
      return c.json({ error: "Session JSONL not found" }, 404);
    }

    const rawToStore = conversationOnly
      ? filterConversationJsonl(result.raw)
      : result.raw;
    const transcript = parseTranscriptFromJsonl(rawToStore, body.sessionId, projectPath);
    const sessionName = extractSessionName(result.raw);

    const createdAt = new Date().toISOString();
    const id = buildSnapshotId(body.sessionId, createdAt);

    const meta: SnapshotMeta = {
      id,
      sessionId: body.sessionId,
      sessionName,
      projectPath: result.transcript.projectPath,
      createdAt,
      sessionStartTime: result.transcript.startTime,
      entryCount: transcript.entries.length,
      userMessageCount: transcript.totalUserMessages,
      assistantMessageCount: transcript.totalAssistantMessages,
      sizeBytes: Buffer.byteLength(rawToStore, "utf-8"),
      note,
      conversationOnly,
    };

    const snapshot: SnapshotFile = {
      schema: 1,
      meta,
      raw: rawToStore,
    };

    await ensureSnapshotsDir();
    const filePath = join(PATHS.snapshotsDir, `${id}.json`);

    return await withFileLock(filePath, async () => {
      // Never overwrite an existing snapshot — they are immutable
      try {
        await stat(filePath);
        return c.json({ error: "A snapshot with this ID already exists" }, 409);
      } catch {
        // File doesn't exist — proceed
      }

      const tmpPath = `${filePath}.tmp`;
      try {
        await writeFile(tmpPath, JSON.stringify(snapshot, null, 2), "utf-8");
        await rename(tmpPath, filePath);
      } catch (err) {
        await unlink(tmpPath).catch((cleanupErr: unknown) => {
          if (
            cleanupErr &&
            typeof cleanupErr === "object" &&
            "code" in cleanupErr &&
            (cleanupErr as NodeJS.ErrnoException).code === "ENOENT"
          ) {
            return;
          }
          console.error("POST /api/transcripts/snapshots tmp cleanup error:", cleanupErr);
        });
        throw err;
      }
      return c.json({ meta } satisfies { meta: SnapshotMeta });
    });
  } catch (err) {
    console.error("POST /api/transcripts/snapshots error:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return c.json({ error: message }, 500);
  }
});

// GET /snapshots — list all saved snapshots, optionally filtered by project scope.
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
      try {
        const parsed = await readSnapshotFile(filePath);
        if (!parsed) continue;
        if (projectPath && parsed.meta.projectPath !== projectPath) continue;
        // Backfill fields that may be absent in older snapshot files
        const meta: SnapshotMeta = {
          ...parsed.meta,
          sessionName: parsed.meta.sessionName ?? "",
          conversationOnly: parsed.meta.conversationOnly ?? false,
        };
        metas.push(meta);
      } catch (err) {
        console.error(`GET /api/transcripts/snapshots: skipping corrupt ${file}:`, err);
        continue;
      }
    }

    metas.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );

    return c.json({ snapshots: metas } satisfies SnapshotListResponse);
  } catch (err) {
    console.error("GET /api/transcripts/snapshots error:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return c.json({ error: message }, 500);
  }
});

// GET /snapshots/:id — load a snapshot's full transcript.
transcripts.get("/snapshots/:id", async (c) => {
  try {
    const idCheck = validateSnapshotId(c.req.param("id"));
    if (!idCheck.valid) return c.json({ error: idCheck.error }, 400);

    const filePath = join(PATHS.snapshotsDir, `${idCheck.value}.json`);
    const parsed = await readSnapshotFile(filePath);
    if (!parsed) {
      return c.json({ error: "Snapshot not found" }, 404);
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
    console.error("GET /api/transcripts/snapshots/:id error:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return c.json({ error: message }, 500);
  }
});

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
    console.error("DELETE /api/transcripts/snapshots/:id error:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return c.json({ error: message }, 500);
  }
});

// GET /snapshots/:id/export — download a snapshot as a portable JSON file.
transcripts.get("/snapshots/:id/export", async (c) => {
  try {
    const idCheck = validateSnapshotId(c.req.param("id"));
    if (!idCheck.valid) return c.json({ error: idCheck.error }, 400);

    const filePath = join(PATHS.snapshotsDir, `${idCheck.value}.json`);
    const parsed = await readSnapshotFile(filePath);
    if (!parsed) {
      return c.json({ error: "Snapshot not found" }, 404);
    }

    const rawName = `snapshot-${parsed.meta.sessionId.slice(0, 8)}-${parsed.meta.createdAt.replace(/[:.]/g, "-")}.json`;
    const fileName = rawName.replace(/[^A-Za-z0-9._-]/g, "");
    c.header("Content-Type", "application/json");
    c.header("Content-Disposition", `attachment; filename="${fileName}"`);
    return c.body(JSON.stringify(parsed, null, 2));
  } catch (err) {
    console.error("GET /api/transcripts/snapshots/:id/export error:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return c.json({ error: message }, 500);
  }
});

// POST /snapshots/import — import a snapshot from a portable JSON file.
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

      const file = body as Partial<SnapshotFile>;
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

      // Re-derive transcript stats from raw so a hostile or stale meta cannot
      // lie about message counts, timestamps, or size.
      const derivedTranscript = parseTranscriptFromJsonl(
        file.raw,
        importedSessionId,
        validatedProjectPath,
      );
      const sizeBytes = Buffer.byteLength(file.raw, "utf-8");

      // Generate a new ID for the imported snapshot to avoid collisions
      const createdAt = new Date().toISOString();
      const id = buildSnapshotId(importedSessionId, createdAt);

      const note = importedNote
        ? `[imported] ${importedNote}`.slice(0, MAX_NOTE_LENGTH)
        : `[imported] originally from ${new Date(file.meta.createdAt).toLocaleString()}`.slice(
            0,
            MAX_NOTE_LENGTH,
          );

      const meta: SnapshotMeta = {
        id,
        sessionId: importedSessionId,
        sessionName: importedSessionName,
        projectPath: validatedProjectPath,
        createdAt,
        sessionStartTime: derivedTranscript.startTime,
        entryCount: derivedTranscript.entries.length,
        userMessageCount: derivedTranscript.totalUserMessages,
        assistantMessageCount: derivedTranscript.totalAssistantMessages,
        sizeBytes,
        note,
        conversationOnly,
      };

      const snapshot: SnapshotFile = {
        schema: 1,
        meta,
        raw: file.raw,
      };

      await ensureSnapshotsDir();
      const filePath = join(PATHS.snapshotsDir, `${id}.json`);

      return await withFileLock(filePath, async () => {
        // Never overwrite — snapshots are immutable
        try {
          await stat(filePath);
          return c.json({ error: "A snapshot with this ID already exists" }, 409);
        } catch {
          // File doesn't exist — proceed
        }

        const tmpPath = `${filePath}.tmp`;
        try {
          await writeFile(tmpPath, JSON.stringify(snapshot, null, 2), "utf-8");
          await rename(tmpPath, filePath);
        } catch (err) {
          await unlink(tmpPath).catch((cleanupErr: unknown) => {
            if (
              cleanupErr &&
              typeof cleanupErr === "object" &&
              "code" in cleanupErr &&
              (cleanupErr as NodeJS.ErrnoException).code === "ENOENT"
            ) {
              return;
            }
            console.error(
              "POST /api/transcripts/snapshots/import tmp cleanup error:",
              cleanupErr,
            );
          });
          throw err;
        }
        return c.json({ meta } satisfies { meta: SnapshotMeta });
      });
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
// Only works with full snapshots — conversation-only snapshots lack the
// system/progress/file-history entries Claude Code needs to resume properly.
transcripts.post("/snapshots/:id/spawn", async (c) => {
  try {
    const idCheck = validateSnapshotId(c.req.param("id"));
    if (!idCheck.valid) return c.json({ error: idCheck.error }, 400);

    const filePath = join(PATHS.snapshotsDir, `${idCheck.value}.json`);
    const parsed = await readSnapshotFile(filePath);
    if (!parsed) {
      return c.json({ error: "Snapshot not found" }, 404);
    }

    if (parsed.meta.conversationOnly) {
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
    // picks up the new ID instead of the original one. A parse failure here
    // is fatal — writing mixed sessionIds would corrupt the spawned session.
    const rewrittenRaw = parsed.raw
      .split("\n")
      .map((line) => {
        const trimmed = line.trim();
        if (!trimmed) return line;
        try {
          const entry = JSON.parse(trimmed);
          if (entry.sessionId) {
            entry.sessionId = newSessionId;
          }
          return JSON.stringify(entry);
        } catch {
          throw new Error(
            "Snapshot contains unparseable JSONL; spawn aborted to avoid sessionId corruption",
          );
        }
      })
      .join("\n");

    const { projectPath } = parsed.meta;
    const sessionsDir = getProjectSessionsDir(projectPath);
    await mkdir(sessionsDir, { recursive: true });

    const sessionFile = join(sessionsDir, `${newSessionId}.jsonl`);
    await writeFile(sessionFile, rewrittenRaw, { encoding: "utf-8", flag: "wx" });

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
