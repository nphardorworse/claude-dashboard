import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join, resolve } from "path";
import { listSubagentFiles, resolveDirProject, toSessionDirName } from "./paths";

let root: string;

before(async () => {
  root = await mkdtemp(join(tmpdir(), "paths-test-"));
});

after(async () => {
  await rm(root, { recursive: true, force: true });
});

const jsonl = (entries: object[]) => `${entries.map((e) => JSON.stringify(e)).join("\n")}\n`;

/** Write `files` (name → entries) into a fresh dir and return its path. */
const makeDir = async (name: string, files: Record<string, object[]>) => {
  const dir = join(root, name);
  await mkdir(dir, { recursive: true });
  for (const [file, entries] of Object.entries(files)) {
    await writeFile(join(dir, file), jsonl(entries), "utf-8");
  }
  return dir;
};

test("toSessionDirName replaces every non-alphanumeric character like Claude Code", () => {
  assert.equal(toSessionDirName("/Users/a/.crew/my proj_x"), "-Users-a--crew-my-proj-x");
  assert.equal(toSessionDirName("C:\\Users\\a\\proj.v2"), "C--Users-a-proj-v2");
});

test("finds a cwd that sits past a long first entry", async () => {
  const cwd = resolve(root, "long");
  const dirName = toSessionDirName(cwd);
  const dir = await makeDir(dirName, {
    "a.jsonl": [
      { type: "custom-title", customTitle: "t" },
      // A SessionStart hook entry larger than the old 2000-char head.
      { type: "attachment", cwd, stdout: "x".repeat(10_000) },
    ],
  });
  assert.equal(await resolveDirProject(dir, dirName, ["a.jsonl"]), cwd);
});

test("prefers the cwd whose dir name matches the dir over the first one found", async () => {
  const own = resolve(root, "own");
  const other = resolve(root, "scratch");
  const dirName = toSessionDirName(own);
  const dir = await makeDir(dirName, {
    "a.jsonl": [{ type: "user", cwd: other }],
    "b.jsonl": [{ type: "user", cwd: own }],
  });
  assert.equal(await resolveDirProject(dir, dirName, ["a.jsonl", "b.jsonl"]), own);
});

test("falls back to the first cwd when none matches the dir name", async () => {
  const repo = resolve(root, "repo");
  const dir = await makeDir("worktree-dir", {
    "a.jsonl": [{ type: "queue-operation" }],
    "b.jsonl": [{ type: "user", cwd: repo }],
  });
  assert.equal(await resolveDirProject(dir, "worktree-dir", ["a.jsonl", "b.jsonl"]), repo);
});

test("returns null when no file has an absolute cwd", async () => {
  const dir = await makeDir("no-cwd", {
    "a.jsonl": [{ type: "summary" }, { type: "user", cwd: "relative/path" }],
  });
  assert.equal(await resolveDirProject(dir, "no-cwd", ["a.jsonl"]), null);
});

test("lists subagent transcripts at any depth, and none for a session without them", async () => {
  const dir = await makeDir("with-subagents", { "s1.jsonl": [], "s2.jsonl": [] });
  const sub = join(dir, "s1", "subagents");
  await mkdir(join(sub, "workflows", "wf_1"), { recursive: true });
  await writeFile(join(sub, "agent-a.jsonl"), "", "utf-8");
  await writeFile(join(sub, "agent-a.meta.json"), "{}", "utf-8");
  await writeFile(join(sub, "workflows", "wf_1", "agent-b.jsonl"), "", "utf-8");

  const found = (await listSubagentFiles(join(dir, "s1.jsonl"))).sort();
  assert.deepEqual(found, [join(sub, "agent-a.jsonl"), join(sub, "workflows", "wf_1", "agent-b.jsonl")].sort());
  assert.deepEqual(await listSubagentFiles(join(dir, "s2.jsonl")), []);
});
