import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { PATHS } from "./paths";
import {
  createSnapshot,
  deleteSnapshot,
  exportChunks,
  listSnapshotMetas,
  loadSnapshotTranscript,
  openSnapshot,
  snapshotFiles,
  writeSpawnedSession,
} from "./snapshot-store";

const SID = "11111111-2222-3333-4444-555555555555";

const lines = [
  { type: "system", sessionId: SID, timestamp: "2026-01-01T00:00:00.000Z" },
  { type: "custom-title", customTitle: "My \"quoted\" session ✨", sessionId: SID },
  {
    type: "user",
    sessionId: SID,
    timestamp: "2026-01-01T00:00:01.000Z",
    message: { role: "user", content: "hello\nworld 🎉" },
  },
  {
    type: "assistant",
    sessionId: SID,
    timestamp: "2026-01-01T00:00:02.000Z",
    message: { role: "assistant", content: [{ type: "tool_use", name: "Read", input: {} }] },
  },
  {
    type: "user",
    sessionId: SID,
    timestamp: "2026-01-01T00:00:03.000Z",
    message: { role: "user", content: [{ type: "tool_result", content: "file body" }] },
  },
  {
    type: "assistant",
    sessionId: SID,
    timestamp: "2026-01-01T00:00:04.000Z",
    message: { role: "assistant", content: [{ type: "text", text: "done" }] },
  },
];
const sessionJsonl = `${lines.map((l) => JSON.stringify(l)).join("\n")}\n`;

let root: string;
let sessionPath: string;
let originalDir: string;

before(async () => {
  root = await mkdtemp(join(tmpdir(), "snapshot-store-"));
  originalDir = PATHS.snapshotsDir;
  PATHS.snapshotsDir = join(root, "snapshots");
  sessionPath = join(root, `${SID}.jsonl`);
  await writeFile(sessionPath, sessionJsonl, "utf-8");
});

after(async () => {
  PATHS.snapshotsDir = originalDir;
  await rm(root, { recursive: true, force: true });
});

const snapshot = (conversationOnly: boolean) =>
  createSnapshot({
    sourcePath: sessionPath,
    sessionId: SID,
    projectPath: "/proj",
    note: "n",
    conversationOnly,
  });

test("a full snapshot is a byte copy plus a meta file", async () => {
  const meta = await snapshot(false);
  assert.ok(meta);
  const files = snapshotFiles(meta.id);
  assert.equal(await readFile(files.jsonl, "utf-8"), sessionJsonl);
  const onDisk = JSON.parse(await readFile(files.meta, "utf-8"));
  assert.equal(onDisk.schema, 2);
  assert.deepEqual(onDisk.meta, meta);
  assert.equal(meta.sessionName, 'My "quoted" session ✨');
  assert.equal(meta.sessionStartTime, "2026-01-01T00:00:00.000Z");
  assert.equal(meta.userMessageCount, 1);
  assert.equal(meta.assistantMessageCount, 2);
  assert.equal(meta.entryCount, 3);
  assert.equal(meta.sizeBytes, Buffer.byteLength(sessionJsonl));

  const snap = await openSnapshot(meta.id);
  assert.ok(snap);
  const transcript = await loadSnapshotTranscript(snap);
  assert.equal(transcript.entries.length, 3);
  assert.equal(transcript.entries[1].toolResults[0].text, "file body");
  assert.ok(await deleteSnapshot(meta.id));
});

test("a conversation-only snapshot keeps only conversation lines", async () => {
  const meta = await snapshot(true);
  assert.ok(meta);
  const kept = (await readFile(snapshotFiles(meta.id).jsonl, "utf-8"))
    .trim()
    .split("\n")
    .map((l) => JSON.parse(l).type);
  assert.deepEqual(kept, ["custom-title", "user", "assistant"]);
  // Start time still comes from the full session.
  assert.equal(meta.sessionStartTime, "2026-01-01T00:00:00.000Z");
  assert.equal(meta.sessionName, 'My "quoted" session ✨');
  assert.equal(meta.entryCount, 2);
  assert.ok(await deleteSnapshot(meta.id));
});

test("export streams a portable schema 1 file that round-trips", async () => {
  const meta = await snapshot(false);
  assert.ok(meta);
  const snap = await openSnapshot(meta.id);
  assert.ok(snap);
  let out = "";
  for await (const chunk of exportChunks(snap)) out += chunk;
  const parsed = JSON.parse(out);
  assert.equal(parsed.schema, 1);
  assert.deepEqual(parsed.meta, meta);
  assert.equal(parsed.raw, sessionJsonl);
  assert.ok(await deleteSnapshot(meta.id));
});

test("delete removes both files and reports a missing snapshot", async () => {
  const meta = await snapshot(false);
  assert.ok(meta);
  assert.ok(await deleteSnapshot(meta.id));
  assert.deepEqual(await readdir(PATHS.snapshotsDir), []);
  assert.equal(await deleteSnapshot(meta.id), false);
  assert.equal(await openSnapshot(meta.id), null);
});

test("schema 1 files still list, open, spawn and delete", async () => {
  const legacyMeta = {
    id: "legacy1",
    sessionId: SID,
    projectPath: "/proj",
    createdAt: "2025-01-01T00:00:00.000Z",
    sessionStartTime: "",
    entryCount: 3,
    userMessageCount: 1,
    assistantMessageCount: 2,
    sizeBytes: 1,
    note: 'tricky\n  "raw": note',
  };
  const legacyFile = { schema: 1, meta: legacyMeta, raw: sessionJsonl };
  await writeFile(snapshotFiles("legacy1").legacy, JSON.stringify(legacyFile, null, 2));

  const listed = await listSnapshotMetas();
  assert.equal(listed.length, 1);
  assert.deepEqual(listed[0], { ...legacyMeta, sessionName: "", conversationOnly: false });

  const snap = await openSnapshot("legacy1");
  assert.equal(snap?.schema, 1);
  assert.equal((await loadSnapshotTranscript(snap!)).entries.length, 3);

  const target = join(root, "spawned.jsonl");
  await writeSpawnedSession(snap!, target, "new-id");
  const spawned = (await readFile(target, "utf-8")).trim().split("\n").map((l) => JSON.parse(l));
  assert.equal(spawned.length, lines.length);
  assert.ok(spawned.every((e) => e.sessionId === "new-id"));

  assert.ok(await deleteSnapshot("legacy1"));
  assert.deepEqual(await listSnapshotMetas(), []);
});

test("spawn aborts on unparseable JSONL and leaves no file behind", async () => {
  const brokenPath = join(root, "broken.jsonl");
  await writeFile(brokenPath, `${JSON.stringify(lines[0])}\n{not json\n`);
  const meta = await createSnapshot({
    sourcePath: brokenPath,
    sessionId: SID,
    projectPath: "/proj",
    note: "",
    conversationOnly: false,
  });
  assert.ok(meta);
  const snap = await openSnapshot(meta.id);
  const target = join(root, "spawn-broken.jsonl");
  await assert.rejects(writeSpawnedSession(snap!, target, "x"), /unparseable/);
  const left = (await readdir(root)).filter((n) => n.startsWith("spawn-broken"));
  assert.deepEqual(left, []);
  assert.ok(await deleteSnapshot(meta.id));
});
