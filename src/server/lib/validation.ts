/**
 * Shared input-validation helpers for server routes.
 */

// ── Permission strings ──────────────────────────────────────

const CONTROL_CHAR_RE = /[\x00-\x1f\x7f]/;
const MAX_PERMISSION_LENGTH = 200;
const MAX_PERMISSIONS_COUNT = 100;

export const validatePermissions = (
  allow: unknown
): { valid: true; value: string[] } | { valid: false; error: string } => {
  if (!Array.isArray(allow)) {
    return { valid: false, error: "allow must be an array" };
  }
  if (allow.length > MAX_PERMISSIONS_COUNT) {
    return { valid: false, error: `Too many permissions (max ${MAX_PERMISSIONS_COUNT})` };
  }
  for (const item of allow) {
    if (typeof item !== "string" || !item.trim()) {
      return { valid: false, error: "Each permission must be a non-empty string" };
    }
    if (item.length > MAX_PERMISSION_LENGTH) {
      return { valid: false, error: `Permission too long (max ${MAX_PERMISSION_LENGTH} chars)` };
    }
    if (CONTROL_CHAR_RE.test(item)) {
      return { valid: false, error: "Permission contains invalid control characters" };
    }
  }
  return { valid: true, value: allow as string[] };
};

// ── MCP server inputs ───────────────────────────────────────

const MCP_NAME_RE = /^[a-zA-Z0-9_@/.:-]+$/;
const MAX_MCP_NAME_LENGTH = 100;
const MAX_COMMAND_LENGTH = 500;
const MAX_ARGS_COUNT = 20;
const MAX_ARG_LENGTH = 500;
const MAX_URL_LENGTH = 2000;
const MCP_URL_RE = /^https?:\/\/.+/;
const MAX_ENV_ENTRIES = 50;
const ENV_KEY_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
const MAX_ENV_VALUE_LENGTH = 1000;

export const validateMcpName = (
  name: unknown
): { valid: true; value: string } | { valid: false; error: string } => {
  if (typeof name !== "string" || !name.trim()) {
    return { valid: false, error: "Server name is required" };
  }
  const trimmed = name.trim();
  if (trimmed.length > MAX_MCP_NAME_LENGTH) {
    return { valid: false, error: `Server name too long (max ${MAX_MCP_NAME_LENGTH} chars)` };
  }
  if (!MCP_NAME_RE.test(trimmed)) {
    return { valid: false, error: "Server name contains invalid characters" };
  }
  return { valid: true, value: trimmed };
};

export const validateMcpCommand = (
  command: unknown
): { valid: true; value: string } | { valid: false; error: string } => {
  if (typeof command !== "string" || !command.trim()) {
    return { valid: false, error: "Command is required" };
  }
  if (command.length > MAX_COMMAND_LENGTH) {
    return { valid: false, error: `Command too long (max ${MAX_COMMAND_LENGTH} chars)` };
  }
  if (CONTROL_CHAR_RE.test(command)) {
    return { valid: false, error: "Command contains invalid control characters" };
  }
  return { valid: true, value: command.trim() };
};

export const validateMcpUrl = (
  url: unknown
): { valid: true; value: string } | { valid: false; error: string } => {
  if (typeof url !== "string" || !url.trim()) {
    return { valid: false, error: "URL is required" };
  }
  const trimmed = url.trim();
  if (trimmed.length > MAX_URL_LENGTH) {
    return { valid: false, error: `URL too long (max ${MAX_URL_LENGTH} chars)` };
  }
  if (!MCP_URL_RE.test(trimmed)) {
    return { valid: false, error: "URL must start with http:// or https://" };
  }
  if (CONTROL_CHAR_RE.test(trimmed)) {
    return { valid: false, error: "URL contains invalid control characters" };
  }
  return { valid: true, value: trimmed };
};

export const validateMcpArgs = (
  args: unknown
): { valid: true; value: string[] | undefined } | { valid: false; error: string } => {
  if (args == null) return { valid: true, value: undefined };
  if (!Array.isArray(args)) {
    return { valid: false, error: "args must be an array" };
  }
  if (args.length > MAX_ARGS_COUNT) {
    return { valid: false, error: `Too many args (max ${MAX_ARGS_COUNT})` };
  }
  for (const arg of args) {
    if (typeof arg !== "string") {
      return { valid: false, error: "Each arg must be a string" };
    }
    if (arg.length > MAX_ARG_LENGTH) {
      return { valid: false, error: `Arg too long (max ${MAX_ARG_LENGTH} chars)` };
    }
  }
  return { valid: true, value: args as string[] };
};

export const validateMcpEnv = (
  env: unknown
): { valid: true; value: Record<string, string> | undefined } | { valid: false; error: string } => {
  if (env == null) return { valid: true, value: undefined };
  if (typeof env !== "object" || Array.isArray(env)) {
    return { valid: false, error: "env must be an object" };
  }
  const entries = Object.entries(env as Record<string, unknown>);
  if (entries.length > MAX_ENV_ENTRIES) {
    return { valid: false, error: `Too many env vars (max ${MAX_ENV_ENTRIES})` };
  }
  for (const [key, val] of entries) {
    if (!ENV_KEY_RE.test(key)) {
      return { valid: false, error: `Invalid env var name: "${key}"` };
    }
    if (typeof val !== "string") {
      return { valid: false, error: `Env var "${key}" must be a string value` };
    }
    if (val.length > MAX_ENV_VALUE_LENGTH) {
      return { valid: false, error: `Env var "${key}" value too long (max ${MAX_ENV_VALUE_LENGTH} chars)` };
    }
  }
  return { valid: true, value: env as Record<string, string> };
};

// ── Hook inputs ─────────────────────────────────────────────

const MAX_HOOK_COMMAND_LENGTH = 500;
const MAX_HOOK_MATCHER_LENGTH = 200;
const MAX_HOOK_TIMEOUT = 300_000;

export const validateHookCommand = (
  command: unknown
): { valid: true; value: string } | { valid: false; error: string } => {
  if (typeof command !== "string" || !command.trim()) {
    return { valid: false, error: "Command is required" };
  }
  if (command.length > MAX_HOOK_COMMAND_LENGTH) {
    return { valid: false, error: `Command too long (max ${MAX_HOOK_COMMAND_LENGTH} chars)` };
  }
  if (CONTROL_CHAR_RE.test(command)) {
    return { valid: false, error: "Command contains invalid control characters" };
  }
  return { valid: true, value: command.trim() };
};

export const validateHookMatcher = (
  matcher: unknown
): { valid: true; value: string } | { valid: false; error: string } => {
  if (typeof matcher !== "string" || !matcher.trim()) {
    return { valid: false, error: "Matcher is required" };
  }
  if (matcher.length > MAX_HOOK_MATCHER_LENGTH) {
    return { valid: false, error: `Matcher too long (max ${MAX_HOOK_MATCHER_LENGTH} chars)` };
  }
  if (CONTROL_CHAR_RE.test(matcher)) {
    return { valid: false, error: "Matcher contains invalid control characters" };
  }
  return { valid: true, value: matcher.trim() };
};

export const validateHookTimeout = (
  timeout: unknown
): { valid: true; value: number | undefined } | { valid: false; error: string } => {
  if (timeout == null) return { valid: true, value: undefined };
  if (typeof timeout !== "number" || !Number.isInteger(timeout)) {
    return { valid: false, error: "Timeout must be an integer" };
  }
  if (timeout <= 0 || timeout > MAX_HOOK_TIMEOUT) {
    return { valid: false, error: `Timeout must be between 1 and ${MAX_HOOK_TIMEOUT} ms` };
  }
  return { valid: true, value: timeout };
};

// ── Hook map validation ─────────────────────────────────────

export const validateHookEntries = (
  entries: unknown
): { valid: true } | { valid: false; error: string } => {
  if (!Array.isArray(entries)) {
    return { valid: false, error: "Hook entries must be an array" };
  }
  for (const entry of entries) {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
      return { valid: false, error: "Each hook entry must be an object" };
    }
    const e = entry as Record<string, unknown>;
    if (e.matcher !== undefined) {
      const matcherCheck = validateHookMatcher(e.matcher);
      if (!matcherCheck.valid) return matcherCheck;
    }
    if (!Array.isArray(e.hooks)) {
      return { valid: false, error: "Each entry must have a hooks array" };
    }
    for (const hook of e.hooks as unknown[]) {
      if (typeof hook !== "object" || hook === null) {
        return { valid: false, error: "Each hook command must be an object" };
      }
      const h = hook as Record<string, unknown>;
      if (h.type !== "command") {
        return { valid: false, error: `Invalid hook type (must be "command")` };
      }
      const cmdCheck = validateHookCommand(h.command);
      if (!cmdCheck.valid) return cmdCheck;
      if (h.timeout !== undefined) {
        const timeoutCheck = validateHookTimeout(h.timeout);
        if (!timeoutCheck.valid) return timeoutCheck;
      }
    }
  }
  return { valid: true };
};

export const validateHooksMap = (
  hooks: unknown
): { valid: true } | { valid: false; error: string } => {
  if (typeof hooks !== "object" || hooks === null || Array.isArray(hooks)) {
    return { valid: false, error: "hooks must be an object" };
  }
  for (const [, entries] of Object.entries(hooks as Record<string, unknown>)) {
    const check = validateHookEntries(entries);
    if (!check.valid) return check;
  }
  return { valid: true };
};

// ── Settings key validation ─────────────────────────────────

const DANGEROUS_KEYS = new Set(["__proto__", "constructor", "prototype"]);
const MAX_ID_LENGTH = 200;

export const validateSettingsId = (
  id: unknown,
  label = "ID"
): { valid: true; value: string } | { valid: false; error: string } => {
  if (typeof id !== "string" || !id.trim()) {
    return { valid: false, error: `${label} is required` };
  }
  if (id.length > MAX_ID_LENGTH) {
    return { valid: false, error: `${label} too long (max ${MAX_ID_LENGTH} chars)` };
  }
  if (DANGEROUS_KEYS.has(id)) {
    return { valid: false, error: `Invalid ${label}` };
  }
  if (CONTROL_CHAR_RE.test(id)) {
    return { valid: false, error: `${label} contains invalid characters` };
  }
  return { valid: true, value: id };
};

// ── Plain object check ──────────────────────────────────────

export const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null && !Array.isArray(value);
};
