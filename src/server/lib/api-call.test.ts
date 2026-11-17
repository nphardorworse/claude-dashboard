import { test } from "node:test";
import assert from "node:assert/strict";
import { createApiCallFilter } from "./api-call";

test("counts each API call once across its repeated content-block lines", () => {
  const isNew = createApiCallFilter();
  const line = (id: string, requestId: string) => ({ requestId, message: { id } });
  assert.equal(isNew(line("msg_1", "req_1")), true);
  assert.equal(isNew(line("msg_1", "req_1")), false);
  assert.equal(isNew(line("msg_1", "req_1")), false);
  assert.equal(isNew(line("msg_2", "req_2")), true);
  // Same message id under another request is another billed call.
  assert.equal(isNew(line("msg_1", "req_3")), true);
});

test("always counts lines without a message id", () => {
  const isNew = createApiCallFilter();
  assert.equal(isNew({}), true);
  assert.equal(isNew({}), true);
});

test("each filter keeps its own seen set", () => {
  const a = createApiCallFilter();
  const b = createApiCallFilter();
  const entry = { requestId: "r", message: { id: "m" } };
  assert.equal(a(entry), true);
  assert.equal(b(entry), true);
});
