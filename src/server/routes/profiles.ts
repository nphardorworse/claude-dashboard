import { Hono } from "hono";
import { readdir, unlink } from "fs/promises";
import { dirname, join } from "path";
import { PATHS, getProjectPath, getSettingsPath } from "../lib/paths";
import { readJsonFile, writeJsonFile, ensureDir } from "../lib/file-io";
import type { HookEntry, HooksMap, ProfileEntry } from "../../shared/types";
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

const isHooksMatch = (
  profileHooks: HooksMap,
  settingsHooks: HooksMap
): boolean => {
  const profileKeys = Object.keys(profileHooks).sort();
  const settingsKeys = Object.keys(settingsHooks).sort();
  if (profileKeys.length !== settingsKeys.length) return false;
  if (profileKeys.join(",") !== settingsKeys.join(",")) return false;
  return JSON.stringify(profileHooks, Object.keys(profileHooks).sort())
    === JSON.stringify(settingsHooks, Object.keys(settingsHooks).sort());
};

const isMcpMatch = (
  profile: ProfileFile,
  enabledServers: Set<string>,
  disabledServers: Set<string>
): boolean => {
  for (const name of profile.enabledMcpServers) {
    if (!enabledServers.has(name)) return false;
  }
  for (const name of profile.disabledMcpServers) {
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
  return (
    isToggleMapMatch(profile.enabledPlugins, effectivePlugins) &&
    isToggleMapMatch(profile.enabledSkills, effectiveSkills) &&
    isHooksMatch(profile.hooks, effectiveHooks) &&
    isMcpMatch(profile, enabledMcpNames, disabledMcpNames)
  );
};

const SAFE_NAME_RE = /^[a-zA-Z0-9_-]+$/;

const validateProfileName = (name: string): boolean => {
  return SAFE_NAME_RE.test(name) && !name.includes("..");
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

    const claudeJson = await readJsonFile<ClaudeJson>(PATHS.claudeJson);
    const enabledMcpNames = new Set(Object.keys(claudeJson?.mcpServers ?? {}));
    const disabledMcpNames = new Set(Object.keys(claudeJson?.disabledMcpServers ?? {}));

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
      const mcpServerCount =
        (data.enabledMcpServers ?? []).length + (data.disabledMcpServers ?? []).length;

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

    // Step 1: Write plugins + skills + hooks to settings.json
    const settings = (await readJsonFile<SettingsFile>(settingsPath)) ?? {};

    const updatedPlugins: Record<string, boolean> = {};
    for (const key of Object.keys(settings.enabledPlugins ?? {})) {
      updatedPlugins[key] = false;
    }
    for (const [key, val] of Object.entries(profile.enabledPlugins)) {
      updatedPlugins[key] = val;
    }

    const updatedSkills: Record<string, boolean> = {};
    for (const key of Object.keys(settings.enabledSkills ?? {})) {
      updatedSkills[key] = false;
    }
    for (const [key, val] of Object.entries(profile.enabledSkills ?? {})) {
      updatedSkills[key] = val;
    }

    const updatedSettings = {
      ...settings,
      enabledPlugins: updatedPlugins,
      enabledSkills: updatedSkills,
      hooks: profile.hooks ?? {},
    };
    await writeJsonFile(settingsPath, updatedSettings);

    // Step 2: Toggle MCP state in ~/.claude.json
    if (
      (profile.enabledMcpServers ?? []).length > 0 ||
      (profile.disabledMcpServers ?? []).length > 0
    ) {
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
    }

    const pluginCount = getEnabledKeys(profile.enabledPlugins).size;
    return c.json({ ok: true, pluginCount });
  } catch (err) {
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

    await ensureDir(PATHS.profilesDir);
    const filePath = join(PATHS.profilesDir, `${name}.json`);

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
  } catch (err) {
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

    const claudeJson = await readJsonFile<ClaudeJson>(PATHS.claudeJson);
    const enabledMcpServers = Object.keys(claudeJson?.mcpServers ?? {});
    const disabledMcpServers = Object.keys(claudeJson?.disabledMcpServers ?? {});

    const enabledPluginsOnly: Record<string, boolean> = {};
    for (const [key, val] of Object.entries(effectivePlugins)) {
      if (val) enabledPluginsOnly[key] = true;
    }

    const enabledSkillsOnly: Record<string, boolean> = {};
    for (const [key, val] of Object.entries(effectiveSkills)) {
      if (val) enabledSkillsOnly[key] = true;
    }

    await ensureDir(PATHS.profilesDir);
    const filePath = join(PATHS.profilesDir, `${name}.json`);

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
  } catch (err) {
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
    const existing = await readJsonFile<ProfileFile>(filePath);
    if (!existing) {
      return c.json({ error: `Profile "${name}" not found` }, 404);
    }

    const body = await c.req.json<{
      description?: string;
      plugins?: Record<string, boolean>;
      skills?: Record<string, boolean>;
      hooks?: HooksMap;
      enabledMcpServers?: string[];
      disabledMcpServers?: string[];
    }>();

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
  } catch (err) {
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
    await unlink(filePath);

    return c.json({ ok: true });
  } catch (err: unknown) {
    if (err instanceof Error && "code" in err && (err as NodeJS.ErrnoException).code === "ENOENT") {
      return c.json({ error: "Profile not found" }, 404);
    }
    const message = err instanceof Error ? err.message : "Unknown error";
    return c.json({ error: message }, 500);
  }
});

export { profiles };
