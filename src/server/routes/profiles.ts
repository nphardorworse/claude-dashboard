import { Hono } from "hono";
import { readdir, unlink } from "fs/promises";
import { dirname, join } from "path";
import { PATHS, getProjectPath, getSettingsPath } from "../lib/paths";
import { readJsonFile, writeJsonFile, ensureDir, createBackup } from "../lib/file-io";
import { withFileLock } from "../lib/file-lock";
import { scanPlugins } from "../lib/plugin-scanner";
import { scanSkills } from "../lib/skill-scanner";
import type { HooksMap, ProfileEntry } from "../../shared/types";
import type { ClaudeJson, ProjectEntry } from "../lib/types";

type ProfileFile = {
  _description: string;
  enabledPlugins: Record<string, boolean>;
  enabledSkills: Record<string, boolean>;
  hooks: HooksMap;
  enabledMcpServers: string[];
  disabledMcpServers: string[];
};

type SettingsFile = {
  enabledPlugins?: Record<string, boolean>;
  enabledSkills?: Record<string, boolean>;
  hooks?: HooksMap;
  [key: string]: unknown;
};

const getEnabledKeys = (plugins: Record<string, boolean>): Set<string> => {
  const keys = new Set<string>();
  for (const [key, val] of Object.entries(plugins)) {
    if (val) keys.add(key);
  }
  return keys;
};

const isToggleMapMatch = (
  profileMap: Record<string, boolean>,
  settingsMap: Record<string, boolean>
): boolean => {
  const profileEnabled = getEnabledKeys(profileMap);
  const settingsEnabled = getEnabledKeys(settingsMap);
  if (profileEnabled.size !== settingsEnabled.size) return false;
  for (const key of profileEnabled) {
    if (!settingsEnabled.has(key)) return false;
  }
  return true;
};

const stableStringify = (obj: unknown): string =>
  JSON.stringify(obj, (_, v) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)))
      : v
  );

const isHooksMatch = (
  profileHooks: HooksMap,
  settingsHooks: HooksMap
): boolean => {
  const profileKeys = Object.keys(profileHooks).sort();
  const settingsKeys = Object.keys(settingsHooks).sort();
  if (profileKeys.length !== settingsKeys.length) return false;
  if (profileKeys.join(",") !== settingsKeys.join(",")) return false;
  return stableStringify(profileHooks) === stableStringify(settingsHooks);
};

const isMcpMatch = (
  profile: ProfileFile,
  enabledServers: Set<string>,
  disabledServers: Set<string>
): boolean => {
  // Only compare servers that still exist — profiles may reference
  // servers that have since been removed from ~/.claude.json
  for (const name of profile.enabledMcpServers) {
    if (!enabledServers.has(name) && !disabledServers.has(name)) continue;
    if (!enabledServers.has(name)) return false;
  }
  for (const name of profile.disabledMcpServers) {
    if (!enabledServers.has(name) && !disabledServers.has(name)) continue;
    if (!disabledServers.has(name)) return false;
  }
  return true;
};

const isFullSuiteMatch = (
  profile: ProfileFile,
  effectivePlugins: Record<string, boolean>,
  effectiveSkills: Record<string, boolean>,
  effectiveHooks: HooksMap,
  enabledMcpNames: Set<string>,
  disabledMcpNames: Set<string>
): boolean => {
  // If the profile doesn't track a section (empty data), skip that comparison
  // rather than requiring the effective state to also be empty
  const profileTracksSkills = Object.keys(profile.enabledSkills).length > 0;
  const profileTracksHooks = Object.keys(profile.hooks).length > 0;
  const profileTracksMcp =
    profile.enabledMcpServers.length > 0 || profile.disabledMcpServers.length > 0;

  return (
    isToggleMapMatch(profile.enabledPlugins, effectivePlugins) &&
    (!profileTracksSkills || isToggleMapMatch(profile.enabledSkills, effectiveSkills)) &&
    (!profileTracksHooks || isHooksMatch(profile.hooks, effectiveHooks)) &&
    (!profileTracksMcp || isMcpMatch(profile, enabledMcpNames, disabledMcpNames))
  );
};

const SAFE_NAME_RE = /^[a-zA-Z0-9_-]+$/;

const validateProfileName = (name: string): boolean => {
  return SAFE_NAME_RE.test(name) && !name.includes("..");
};

const isToggleRecord = (val: unknown): val is Record<string, boolean> => {
  if (typeof val !== "object" || val === null || Array.isArray(val)) return false;
  for (const v of Object.values(val as Record<string, unknown>)) {
    if (typeof v !== "boolean") return false;
  }
  return true;
};

const isStringArray = (val: unknown): val is string[] => {
  return Array.isArray(val) && val.every((v) => typeof v === "string");
};

/** Validate profile body fields that are present (returns error string or null). */
const validateProfileBody = (body: {
  plugins?: unknown;
  skills?: unknown;
  hooks?: unknown;
  enabledMcpServers?: unknown;
  disabledMcpServers?: unknown;
}): string | null => {
  if (body.plugins !== undefined && !isToggleRecord(body.plugins)) {
    return "plugins must be a { [id]: boolean } map";
  }
  if (body.skills !== undefined && !isToggleRecord(body.skills)) {
    return "skills must be a { [id]: boolean } map";
  }
  if (body.enabledMcpServers !== undefined && !isStringArray(body.enabledMcpServers)) {
    return "enabledMcpServers must be a string array";
  }
  if (body.disabledMcpServers !== undefined && !isStringArray(body.disabledMcpServers)) {
    return "disabledMcpServers must be a string array";
  }
  return null;
};

const profiles = new Hono();

// GET / — list all profiles with active detection
profiles.get("/", async (c) => {
  try {
    const projectPath = await getProjectPath(c);
    const settingsPath = getSettingsPath(projectPath);

    await ensureDir(PATHS.profilesDir);

    const files = await readdir(PATHS.profilesDir);
    const jsonFiles = files.filter((f) => f.endsWith(".json"));

    // Read raw settings for active detection (must match what switch writes)
    const globalSettings = await readJsonFile<SettingsFile>(PATHS.globalSettings);
    let effectivePlugins = { ...(globalSettings?.enabledPlugins ?? {}) };
    let effectiveSkills = { ...(globalSettings?.enabledSkills ?? {}) };
    let effectiveHooks: HooksMap = { ...(globalSettings?.hooks ?? {}) };

    if (projectPath) {
      const projectSettings = await readJsonFile<SettingsFile>(settingsPath);
      if (projectSettings?.enabledPlugins) {
        effectivePlugins = { ...effectivePlugins, ...projectSettings.enabledPlugins };
      }
      if (projectSettings?.enabledSkills) {
        effectiveSkills = { ...effectiveSkills, ...projectSettings.enabledSkills };
      }
      if (projectSettings?.hooks) {
        effectiveHooks = projectSettings.hooks;
      }
    }

    // Build effective MCP state (global, then apply project overrides)
    const claudeJson = await readJsonFile<ClaudeJson>(PATHS.claudeJson);
    const enabledMcpNames = new Set(Object.keys(claudeJson?.mcpServers ?? {}));
    const disabledMcpNames = new Set(Object.keys(claudeJson?.disabledMcpServers ?? {}));

    if (projectPath && claudeJson?.projects) {
      const projEntry = claudeJson.projects[projectPath] as ProjectEntry | undefined;
      if (projEntry?.disabledMcpServers) {
        for (const name of projEntry.disabledMcpServers) {
          enabledMcpNames.delete(name);
          disabledMcpNames.add(name);
        }
      }
    }

    const entries: ProfileEntry[] = [];
    let activeProfile: string | null = null;

    for (const file of jsonFiles) {
      const filePath = join(PATHS.profilesDir, file);
      const data = await readJsonFile<ProfileFile>(filePath);
      if (!data || !data.enabledPlugins) continue;

      const name = file.replace(/\.json$/, "");
      const pluginCount = getEnabledKeys(data.enabledPlugins).size;
      const skillCount = getEnabledKeys(data.enabledSkills ?? {}).size;
      const hookEventCount = Object.keys(data.hooks ?? {}).length;
      const mcpServerCount = (data.enabledMcpServers ?? []).length;

      const normalizedProfile: ProfileFile = {
        _description: data._description ?? "",
        enabledPlugins: data.enabledPlugins,
        enabledSkills: data.enabledSkills ?? {},
        hooks: data.hooks ?? {},
        enabledMcpServers: data.enabledMcpServers ?? [],
        disabledMcpServers: data.disabledMcpServers ?? [],
      };

      const isActive = isFullSuiteMatch(
        normalizedProfile,
        effectivePlugins,
        effectiveSkills,
        effectiveHooks,
        enabledMcpNames,
        disabledMcpNames
      );

      if (isActive) activeProfile = name;

      entries.push({
        name,
        description: data._description ?? "",
        pluginCount,
        skillCount,
        hookEventCount,
        mcpServerCount,
        plugins: data.enabledPlugins,
        skills: data.enabledSkills ?? {},
        hooks: data.hooks ?? {},
        enabledMcpServers: data.enabledMcpServers ?? [],
        disabledMcpServers: data.disabledMcpServers ?? [],
        isActive,
      });
    }

    return c.json({
      profiles: entries,
      activeProfile,
      scope: projectPath ? "project" : "global",
    });
  } catch (err) {
    console.error("GET /profiles error:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return c.json({ error: message }, 500);
  }
});

// POST /switch — activate a profile (global or project-scoped)
profiles.post("/switch", async (c) => {
  try {
    const projectPath = await getProjectPath(c);
    const settingsPath = getSettingsPath(projectPath);
    const { profileName } = await c.req.json<{ profileName: string }>();
    if (!validateProfileName(profileName)) {
      return c.json({ error: "Invalid profile name" }, 400);
    }
    const profileFilePath = join(PATHS.profilesDir, `${profileName}.json`);

    const profile = await readJsonFile<ProfileFile>(profileFilePath);
    if (!profile) {
      return c.json({ error: `Profile "${profileName}" not found` }, 404);
    }

    if (projectPath) {
      await ensureDir(dirname(settingsPath));
    }

    // Step 1: Write plugins + skills + hooks to settings.json (locked)
    await withFileLock(settingsPath, async () => {
      const settings = (await readJsonFile<SettingsFile>(settingsPath)) ?? {};

      // When project-scoped, read global settings so we can override
      // globally-enabled plugins/skills that aren't in the profile
      const globalSettings = projectPath
        ? await readJsonFile<SettingsFile>(PATHS.globalSettings)
        : null;

      const updatedPlugins: Record<string, boolean> = {};
      for (const key of Object.keys(settings.enabledPlugins ?? {})) {
        updatedPlugins[key] = false;
      }
      if (globalSettings) {
        for (const [key, val] of Object.entries(globalSettings.enabledPlugins ?? {})) {
          if (val && !(key in profile.enabledPlugins)) {
            updatedPlugins[key] = false;
          }
        }
      }
      for (const [key, val] of Object.entries(profile.enabledPlugins)) {
        updatedPlugins[key] = val;
      }

      const updatedSettings: Record<string, unknown> = {
        ...settings,
        enabledPlugins: updatedPlugins,
      };

      const profileSkills = profile.enabledSkills ?? {};
      const updatedSkills: Record<string, boolean> = {};
      for (const key of Object.keys(settings.enabledSkills ?? {})) {
        updatedSkills[key] = false;
      }
      if (globalSettings) {
        for (const [key, val] of Object.entries(globalSettings.enabledSkills ?? {})) {
          if (val && !(key in profileSkills)) {
            updatedSkills[key] = false;
          }
        }
      }
      for (const [key, val] of Object.entries(profileSkills)) {
        updatedSkills[key] = val;
      }
      updatedSettings.enabledSkills = updatedSkills;
      updatedSettings.hooks = profile.hooks ?? {};

      await writeJsonFile(settingsPath, updatedSettings);
    });

    // Step 2: Toggle MCP state in ~/.claude.json (locked separately)
    if (
      (profile.enabledMcpServers ?? []).length > 0 ||
      (profile.disabledMcpServers ?? []).length > 0
    ) {
      await withFileLock(PATHS.claudeJson, async () => {
        const claudeJson = (await readJsonFile<ClaudeJson>(PATHS.claudeJson)) ?? {};

        if (!projectPath) {
          const active = claudeJson.mcpServers ?? {};
          const disabled = claudeJson.disabledMcpServers ?? {};

          for (const name of profile.enabledMcpServers ?? []) {
            if (disabled[name]) {
              active[name] = disabled[name];
              delete disabled[name];
            }
          }
          for (const name of profile.disabledMcpServers ?? []) {
            if (active[name]) {
              disabled[name] = active[name];
              delete active[name];
            }
          }

          claudeJson.mcpServers = active;
          claudeJson.disabledMcpServers = disabled;
        } else {
          const projects = claudeJson.projects ?? {};
          const projEntry = (projects[projectPath] ?? {}) as ProjectEntry;

          const disabledSet = new Set(projEntry.disabledMcpServers ?? []);

          for (const name of profile.enabledMcpServers ?? []) {
            disabledSet.delete(name);
          }
          for (const name of profile.disabledMcpServers ?? []) {
            disabledSet.add(name);
          }

          projEntry.disabledMcpServers = Array.from(disabledSet);
          projects[projectPath] = projEntry;
          claudeJson.projects = projects;
        }

        await writeJsonFile(PATHS.claudeJson, claudeJson);
      });
    }

    const pluginCount = getEnabledKeys(profile.enabledPlugins).size;
    return c.json({ ok: true, pluginCount });
  } catch (err) {
    console.error("POST /profiles/switch error:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return c.json({ error: message }, 500);
  }
});

// POST / — create a new profile
profiles.post("/", async (c) => {
  try {
    const body = await c.req.json<{
      name: string;
      description: string;
      plugins: Record<string, boolean>;
      skills: Record<string, boolean>;
      hooks: HooksMap;
      enabledMcpServers: string[];
      disabledMcpServers: string[];
    }>();
    const { name, description, plugins, skills, hooks: hooksData,
            enabledMcpServers, disabledMcpServers } = body;

    if (!validateProfileName(name)) {
      return c.json({ error: "Invalid profile name" }, 400);
    }

    if (!plugins || !isToggleRecord(plugins)) {
      return c.json({ error: "plugins is required and must be a { [id]: boolean } map" }, 400);
    }

    const bodyError = validateProfileBody({ skills, hooks: hooksData, enabledMcpServers, disabledMcpServers });
    if (bodyError) return c.json({ error: bodyError }, 400);

    await ensureDir(PATHS.profilesDir);
    const filePath = join(PATHS.profilesDir, `${name}.json`);

    return await withFileLock(filePath, async () => {
      const existing = await readJsonFile<ProfileFile>(filePath);
      if (existing) {
        return c.json({ error: `Profile "${name}" already exists` }, 409);
      }

      const data: ProfileFile = {
        _description: description,
        enabledPlugins: plugins,
        enabledSkills: skills ?? {},
        hooks: hooksData ?? {},
        enabledMcpServers: enabledMcpServers ?? [],
        disabledMcpServers: disabledMcpServers ?? [],
      };
      await writeJsonFile(filePath, data);

      return c.json({ ok: true });
    });
  } catch (err) {
    console.error("POST /profiles error:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return c.json({ error: message }, 500);
  }
});

// POST /save-current — snapshot current settings as a profile
profiles.post("/save-current", async (c) => {
  try {
    const projectPath = await getProjectPath(c);
    const settingsPath = getSettingsPath(projectPath);
    const { name, description } = await c.req.json<{
      name: string;
      description: string;
    }>();
    if (!validateProfileName(name)) {
      return c.json({ error: "Invalid profile name" }, 400);
    }

    // Use scanners to get resolved enabled state (not raw settings)
    const [pluginList, skillList] = await Promise.all([
      projectPath ? scanPlugins(getSettingsPath(projectPath)) : scanPlugins(),
      scanSkills(
        projectPath ? getSettingsPath(projectPath) : undefined,
        projectPath
      ),
    ]);

    const enabledPluginsOnly: Record<string, boolean> = {};
    for (const p of pluginList) {
      if (p.enabled) enabledPluginsOnly[p.id] = true;
    }

    const enabledSkillsOnly: Record<string, boolean> = {};
    for (const s of skillList) {
      if (s.enabled) enabledSkillsOnly[s.id] = true;
    }

    // Read hooks from effective settings
    const globalSettings = await readJsonFile<SettingsFile>(PATHS.globalSettings);
    let effectiveHooks: HooksMap = { ...(globalSettings?.hooks ?? {}) };
    if (projectPath) {
      const projectSettings = await readJsonFile<SettingsFile>(settingsPath);
      if (projectSettings?.hooks) {
        effectiveHooks = projectSettings.hooks;
      }
    }

    // Build effective MCP state (global, then apply project overrides)
    const claudeJson = await readJsonFile<ClaudeJson>(PATHS.claudeJson);
    const enabledMcpSet = new Set(Object.keys(claudeJson?.mcpServers ?? {}));
    const disabledMcpSet = new Set(Object.keys(claudeJson?.disabledMcpServers ?? {}));

    if (projectPath && claudeJson?.projects) {
      const projEntry = claudeJson.projects[projectPath] as ProjectEntry | undefined;
      if (projEntry?.disabledMcpServers) {
        for (const n of projEntry.disabledMcpServers) {
          enabledMcpSet.delete(n);
          disabledMcpSet.add(n);
        }
      }
    }

    const enabledMcpServers = Array.from(enabledMcpSet);
    const disabledMcpServers = Array.from(disabledMcpSet);

    await ensureDir(PATHS.profilesDir);
    const filePath = join(PATHS.profilesDir, `${name}.json`);

    return await withFileLock(filePath, async () => {
      const existing = await readJsonFile<ProfileFile>(filePath);
      if (existing) {
        return c.json({ error: `Profile "${name}" already exists` }, 409);
      }

      const data: ProfileFile = {
        _description: description,
        enabledPlugins: enabledPluginsOnly,
        enabledSkills: enabledSkillsOnly,
        hooks: effectiveHooks,
        enabledMcpServers,
        disabledMcpServers,
      };
      await writeJsonFile(filePath, data);

      return c.json({ ok: true });
    });
  } catch (err) {
    console.error("POST /profiles/save-current error:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return c.json({ error: message }, 500);
  }
});

// PUT /:name — update an existing profile
profiles.put("/:name", async (c) => {
  try {
    const name = c.req.param("name");
    if (!validateProfileName(name)) {
      return c.json({ error: "Invalid profile name" }, 400);
    }

    const filePath = join(PATHS.profilesDir, `${name}.json`);

    const body = await c.req.json<{
      description?: string;
      plugins?: Record<string, boolean>;
      skills?: Record<string, boolean>;
      hooks?: HooksMap;
      enabledMcpServers?: string[];
      disabledMcpServers?: string[];
    }>();

    const bodyError = validateProfileBody(body);
    if (bodyError) return c.json({ error: bodyError }, 400);

    return await withFileLock(filePath, async () => {
      const existing = await readJsonFile<ProfileFile>(filePath);
      if (!existing) {
        return c.json({ error: `Profile "${name}" not found` }, 404);
      }

      const updated: ProfileFile = {
        _description: body.description ?? existing._description,
        enabledPlugins: body.plugins ?? existing.enabledPlugins,
        enabledSkills: body.skills ?? existing.enabledSkills ?? {},
        hooks: body.hooks ?? existing.hooks ?? {},
        enabledMcpServers: body.enabledMcpServers ?? existing.enabledMcpServers ?? [],
        disabledMcpServers: body.disabledMcpServers ?? existing.disabledMcpServers ?? [],
      };
      await writeJsonFile(filePath, updated);

      return c.json({ ok: true });
    });
  } catch (err) {
    console.error("PUT /profiles/:name error:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return c.json({ error: message }, 500);
  }
});

// DELETE /:name — delete a profile
profiles.delete("/:name", async (c) => {
  try {
    const name = c.req.param("name");

    if (!validateProfileName(name)) {
      return c.json({ error: "Invalid profile name" }, 400);
    }

    const filePath = join(PATHS.profilesDir, `${name}.json`);
    await createBackup(filePath);
    await unlink(filePath);

    return c.json({ ok: true });
  } catch (err: unknown) {
    if (err instanceof Error && "code" in err && (err as NodeJS.ErrnoException).code === "ENOENT") {
      return c.json({ error: "Profile not found" }, 404);
    }
    console.error("DELETE /profiles/:name error:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return c.json({ error: message }, 500);
  }
});

export { profiles };
