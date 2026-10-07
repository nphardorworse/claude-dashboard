import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeProfile } from "./profile-file";

test("a profile with only enabledPlugins gets every other field", () => {
  assert.deepEqual(normalizeProfile({ enabledPlugins: { "a@m": true } }), {
    _description: "",
    enabledPlugins: { "a@m": true },
    enabledSkills: {},
    hooks: {},
    enabledMcpServers: [],
    disabledMcpServers: [],
  });
});

test("a profile with no enabledPlugins is kept, with an empty map", () => {
  const profile = normalizeProfile({ _description: "MCP only", disabledMcpServers: ["posthog"] });
  assert.deepEqual(profile?.enabledPlugins, {});
  assert.deepEqual(profile?.disabledMcpServers, ["posthog"]);
});

test("fields of the wrong type are replaced, bad entries dropped", () => {
  const profile = normalizeProfile({
    _description: 42,
    enabledPlugins: { "a@m": true, "b@m": "yes" },
    enabledSkills: ["not", "a", "map"],
    hooks: "nope",
    enabledMcpServers: "posthog",
    disabledMcpServers: ["kb", 7],
  });
  assert.deepEqual(profile, {
    _description: "",
    enabledPlugins: { "a@m": true },
    enabledSkills: {},
    hooks: {},
    enabledMcpServers: [],
    disabledMcpServers: ["kb"],
  });
});

test("unknown keys such as skill-scope's skillOverrides are kept", () => {
  const profile = normalizeProfile({ enabledPlugins: {}, skillOverrides: { tinypng: "off" } });
  assert.deepEqual(profile?.skillOverrides, { tinypng: "off" });
});

test("JSON that isn't an object is not a profile", () => {
  assert.equal(normalizeProfile(null), null);
  assert.equal(normalizeProfile([]), null);
  assert.equal(normalizeProfile("text"), null);
});
