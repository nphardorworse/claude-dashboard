import { Hono } from "hono";
import { readdir, unlink } from "fs/promises";
import { dirname, join } from "path";
import { PATHS, getProjectPath, getSettingsPath } from "../lib/paths";
import { readJsonFile, writeJsonFile, ensureDir } from "../lib/file-io";

type ProfileFile = {
  _description: string;
  enabledPlugins: Record<string, boolean>;
};

type SettingsFile = {
  enabledPlugins?: Record<string, boolean>;
  [key: string]: unknown;
};

type ProfileEntry = {
  name: string;
  description: string;
  pluginCount: number;
  plugins: Record<string, boolean>;
  isActive: boolean;
};

const getEnabledKeys = (plugins: Record<string, boolean>): Set<string> => {
  const keys = new Set<string>();
  for (const [key, val] of Object.entries(plugins)) {
    if (val) keys.add(key);
  }
  return keys;
};

const isExactMatch = (
  profilePlugins: Record<string, boolean>,
  settingsPlugins: Record<string, boolean>
): boolean => {
  const profileEnabled = getEnabledKeys(profilePlugins);
  const settingsEnabled = getEnabledKeys(settingsPlugins);

  if (profileEnabled.size !== settingsEnabled.size) return false;

  for (const key of profileEnabled) {
    if (!settingsEnabled.has(key)) return false;
  }

  return true;
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

    // For project scope: merge global + project enabledPlugins to detect active profile
    const globalSettings = await readJsonFile<SettingsFile>(PATHS.globalSettings);
    const globalPlugins = globalSettings?.enabledPlugins ?? {};

    let effectivePlugins = { ...globalPlugins };
    if (projectPath) {
      const projectSettings = await readJsonFile<SettingsFile>(settingsPath);
      if (projectSettings?.enabledPlugins) {
        effectivePlugins = { ...effectivePlugins, ...projectSettings.enabledPlugins };
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
      const isActive = isExactMatch(data.enabledPlugins, effectivePlugins);

      if (isActive) activeProfile = name;

      entries.push({
        name,
        description: data._description ?? "",
        pluginCount,
        plugins: data.enabledPlugins,
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

    const settings = (await readJsonFile<SettingsFile>(settingsPath)) ?? {};

    // Set all existing plugins to false, then apply profile's true values
    const updatedPlugins: Record<string, boolean> = {};
    for (const key of Object.keys(settings.enabledPlugins ?? {})) {
      updatedPlugins[key] = false;
    }
    for (const [key, val] of Object.entries(profile.enabledPlugins)) {
      updatedPlugins[key] = val;
    }

    const updatedSettings = { ...settings, enabledPlugins: updatedPlugins };
    await writeJsonFile(settingsPath, updatedSettings);

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
    const { name, description, plugins } = await c.req.json<{
      name: string;
      description: string;
      plugins: Record<string, boolean>;
    }>();
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

    // For project scope: merge global + project to get effective state
    const globalSettings = await readJsonFile<SettingsFile>(PATHS.globalSettings);
    let effectivePlugins = { ...(globalSettings?.enabledPlugins ?? {}) };
    if (projectPath) {
      const projectSettings = await readJsonFile<SettingsFile>(settingsPath);
      if (projectSettings?.enabledPlugins) {
        effectivePlugins = { ...effectivePlugins, ...projectSettings.enabledPlugins };
      }
    }

    const settings = { enabledPlugins: effectivePlugins };

    await ensureDir(PATHS.profilesDir);
    const filePath = join(PATHS.profilesDir, `${name}.json`);

    const enabledOnly: Record<string, boolean> = {};
    for (const [key, val] of Object.entries(settings.enabledPlugins ?? {})) {
      if (val) enabledOnly[key] = true;
    }

    const data: ProfileFile = {
      _description: description,
      enabledPlugins: enabledOnly,
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

    const { description, plugins } = await c.req.json<{
      description?: string;
      plugins?: Record<string, boolean>;
    }>();

    const updated: ProfileFile = {
      _description: description ?? existing._description,
      enabledPlugins: plugins ?? existing.enabledPlugins,
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
