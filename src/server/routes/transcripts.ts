import { Hono } from "hono";
import { readdir, readFile, stat, writeFile, unlink, mkdir } from "fs/promises";
import { join } from "path";
import { PATHS, getProjectPath, getProjectSessionsDir, resolveSessionFilePath } from "../lib/paths";
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

// ─── DELETE /session/:sessionId ────────────────────────────
// Permanently delete a session's JSONL file from disk.
// Body: { confirm: "<first 8 chars of sessionId>" }
transcripts.delete("/session/:sessionId", async (c) => {
  try {
    const sessionId = c.req.param("sessionId");
    if (!/^[a-zA-Z0-9_-]+$/.test(sessionId)) {
      return c.json({ error: "Invalid session id" }, 400);
    }

    const body = await c.req.json<{ confirm?: unknown; projectPath?: unknown }>();
    const expectedConfirm = sessionId.slice(0, 8);
    if (typeof body.confirm !== "string" || body.confirm !== expectedConfirm) {
      return c.json(
        { error: `Confirmation required: type "${expectedConfirm}" to delete` },
        400,
      );
    }

    const projectPath =
      typeof body.projectPath === "string" ? body.projectPath : "";

    const filePath = await resolveSessionFilePath(sessionId, projectPath);
    if (!filePath) {
      return c.json({ error: "Session JSONL not found" }, 404);
    }

    await unlink(filePath);
    return c.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return c.json({ error: message }, 500);
  }
});

// ─── POST /snapshots ───────────────────────────────────────
// Save an immutable copy of the session's JSONL to disk.
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
      await writeFile(tmpPath, JSON.stringify(snapshot, null, 2), "utf-8");
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
      // Backfill fields that may be absent in older snapshot files
      const meta: SnapshotMeta = {
        ...parsed.meta,
        sessionName: parsed.meta.sessionName ?? "",
        conversationOnly: parsed.meta.conversationOnly ?? false,
      };
      metas.push(meta);
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

// ─── GET /snapshots/:id/export ─────────────────────────────
// Download a snapshot as a portable JSON file for sharing.
transcripts.get("/snapshots/:id/export", async (c) => {
  try {
    const idCheck = validateSnapshotId(c.req.param("id"));
    if (!idCheck.valid) return c.json({ error: idCheck.error }, 400);

    const filePath = join(PATHS.snapshotsDir, `${idCheck.value}.json`);
    const parsed = await readSnapshotFile(filePath);
    if (!parsed) {
      return c.json({ error: "Snapshot not found" }, 404);
    }

    const fileName = `snapshot-${parsed.meta.sessionId.slice(0, 8)}-${parsed.meta.createdAt.replace(/[:.]/g, "-")}.json`;
    c.header("Content-Type", "application/json");
    c.header("Content-Disposition", `attachment; filename="${fileName}"`);
    return c.body(JSON.stringify(parsed, null, 2));
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return c.json({ error: message }, 500);
  }
});

// ─── POST /snapshots/import ───────────────────────────────
// Import a snapshot from a portable JSON file.
transcripts.post("/snapshots/import", async (c) => {
  try {
    const body = await c.req.json<unknown>();

    if (!body || typeof body !== "object") {
      return c.json({ error: "Invalid snapshot file" }, 400);
    }

    const file = body as Partial<SnapshotFile>;
    if (!file.meta || typeof file.raw !== "string" || !file.schema) {
      return c.json({ error: "Invalid snapshot file format" }, 400);
    }
    if (!file.meta.sessionId || !file.meta.createdAt) {
      return c.json({ error: "Snapshot file missing required metadata" }, 400);
    }

    // Generate a new ID for the imported snapshot to avoid collisions
    const createdAt = new Date().toISOString();
    const id = buildSnapshotId(file.meta.sessionId, createdAt);

    const meta: SnapshotMeta = {
      ...file.meta,
      id,
      createdAt,
      // Preserve original note but prepend import marker
      note: file.meta.note
        ? `[imported] ${file.meta.note}`
        : `[imported] originally from ${new Date(file.meta.createdAt).toLocaleString()}`,
      // Backfill fields that may be absent in older exports
      sessionName: file.meta.sessionName ?? "",
      conversationOnly: file.meta.conversationOnly ?? false,
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
      await writeFile(tmpPath, JSON.stringify(snapshot, null, 2), "utf-8");
      const { rename } = await import("fs/promises");
      await rename(tmpPath, filePath);
      return c.json({ meta } satisfies { meta: SnapshotMeta });
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return c.json({ error: message }, 500);
  }
});

// ─── POST /snapshots/:id/spawn ────────────────────────────
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
    // picks up the new ID instead of the original one.
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
          return line;
        }
      })
      .join("\n");

    const { projectPath } = parsed.meta;
    const sessionsDir = getProjectSessionsDir(projectPath);
    await mkdir(sessionsDir, { recursive: true });

    const sessionFile = join(sessionsDir, `${newSessionId}.jsonl`);
    await writeFile(sessionFile, rewrittenRaw, "utf-8");

    return c.json({
      sessionId: newSessionId,
      command: `claude --resume ${newSessionId}`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return c.json({ error: message }, 500);
  }
});

export { transcripts };
