import { validateHooksMap } from "./validation";
import type { HooksMap } from "../../shared/types";

/** The fields of a profile file in ~/.claude/profiles that the dashboard uses. */
export type ProfileFile = {
  _description: string;
  enabledPlugins: Record<string, boolean>;
  enabledSkills: Record<string, boolean>;
  hooks: HooksMap;
  enabledMcpServers: string[];
  disabledMcpServers: string[];
};

/**
 * A profile file as stored. Other tools write to the same folder (the
 * skill-scope mod adds `skillOverrides`), so unknown keys are carried along
 * and written back untouched.
 */
export type StoredProfile = ProfileFile & Record<string, unknown>;

const isPlainObject = (val: unknown): val is Record<string, unknown> =>
  typeof val === "object" && val !== null && !Array.isArray(val);

const toToggleMap = (val: unknown): Record<string, boolean> =>
  isPlainObject(val)
    ? Object.fromEntries(Object.entries(val).filter(([, v]) => typeof v === "boolean")) as Record<string, boolean>
    : {};

const toStringList = (val: unknown): string[] =>
  Array.isArray(val) ? val.filter((v): v is string => typeof v === "string") : [];

/**
 * Read a profile file's parsed JSON into a complete profile: every field
 * present and of the right type, whatever wrote the file. Returns null for
 * JSON that isn't an object at all.
 */
export const normalizeProfile = (raw: unknown): StoredProfile | null => {
  if (!isPlainObject(raw)) return null;
  return {
    ...raw,
    _description: typeof raw._description === "string" ? raw._description : "",
    enabledPlugins: toToggleMap(raw.enabledPlugins),
    enabledSkills: toToggleMap(raw.enabledSkills),
    hooks: validateHooksMap(raw.hooks).valid ? (raw.hooks as HooksMap) : {},
    enabledMcpServers: toStringList(raw.enabledMcpServers),
    disabledMcpServers: toStringList(raw.disabledMcpServers),
  };
};
