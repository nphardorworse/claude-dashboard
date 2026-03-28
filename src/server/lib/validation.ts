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

// ── Plain object check ──────────────────────────────────────

export const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null && !Array.isArray(value);
};
