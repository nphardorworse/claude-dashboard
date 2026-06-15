import { Hono } from "hono";
import { PATHS, getProjectPath, getSettingsPath } from "../lib/paths";
import { readJsonFile, writeJsonFile, ensureDir } from "../lib/file-io";
import { withFileLock } from "../lib/file-lock";
import { scanSkills } from "../lib/skill-scanner";
import { validateSettingsId } from "../lib/validation";
import { lstat, unlink, rm } from "fs/promises";
import { dirname, join } from "path";
import type { SkillsResponse, SkillToggleRequest } from "../../shared/types";

type SettingsJson = {
  enabledSkills?: Record<string, boolean>;
  [key: string]: unknown;
};

const skills = new Hono();

skills.get("/", async (c) => {
  try {
    const projectPath = await getProjectPath(c);
    const settingsPath = getSettingsPath(projectPath);

    const skillList = await scanSkills(
      projectPath ? settingsPath : undefined,
      projectPath
    );

    const activeCount = skillList.filter((s) => s.enabled).length;
    const totalEstimatedTokens = skillList
      .filter((s) => s.enabled)
      .reduce((sum, s) => sum + s.estimatedTokens, 0);

    const response: SkillsResponse = {
      skills: skillList,
      activeCount,
      totalEstimatedTokens,
    };

    return c.json(response);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return c.json({ error: message }, 500);
  }
});

skills.put("/toggle", async (c) => {
  try {
    const body = (await c.req.json()) as SkillToggleRequest;
    const { skillId, enabled } = body;

    if (typeof enabled !== "boolean") {
      return c.json(
        { error: "Invalid request: skillId and enabled required" },
        400
      );
    }
    const idCheck = validateSettingsId(skillId, "skillId");
    if (!idCheck.valid) return c.json({ error: idCheck.error }, 400);

    const projectPath = await getProjectPath(c);
    const settingsPath = getSettingsPath(projectPath);

    if (projectPath) {
      await ensureDir(dirname(settingsPath));
    }

    return await withFileLock(settingsPath, async () => {
      const settings =
        (await readJsonFile<SettingsJson>(settingsPath)) ?? {};
      const enabledSkills = settings.enabledSkills ?? {};

      enabledSkills[idCheck.value] = enabled;
      settings.enabledSkills = enabledSkills;

      await writeJsonFile(settingsPath, settings);

      return c.json({ ok: true, skillId: idCheck.value, enabled });
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return c.json({ error: message }, 500);
  }
});

// POST /delete — delete a user or project skill's folder from disk. Plugin
// skills are owned by their plugin (uninstall the plugin to remove them).
skills.post("/delete", async (c) => {
  try {
    const { skillId } = await c.req.json<{ skillId: string }>();

    const idCheck = validateSettingsId(skillId, "skillId");
    if (!idCheck.valid) return c.json({ error: idCheck.error }, 400);

    const projectPath = await getProjectPath(c);
    const settingsPath = getSettingsPath(projectPath);

    // Re-scan and resolve the skill server-side — never trust a client path.
    const skillList = await scanSkills(
      projectPath ? settingsPath : undefined,
      projectPath ?? undefined
    );
    const skill = skillList.find((s) => s.id === idCheck.value);
    if (!skill) {
      return c.json({ error: `Skill "${idCheck.value}" not found` }, 404);
    }
    if (skill.source === "plugin") {
      return c.json(
        {
          error: `"${skill.name}" comes from the ${skill.pluginName ?? "parent"} plugin — uninstall that plugin to remove it`,
        },
        400
      );
    }

    // installPath is the SKILL.md path; the skill's folder is its parent.
    const skillDir = dirname(skill.installPath);

    // Safety: the folder must be a direct child of an allowed skills root.
    const allowedRoots = [PATHS.skillsDir, PATHS.agentSkillsDir];
    if (projectPath) allowedRoots.push(join(projectPath, ".claude", "skills"));
    if (!allowedRoots.includes(dirname(skillDir))) {
      return c.json(
        { error: "Refusing to delete: skill path is outside the skills directory" },
        400
      );
    }

    // A symlinked skill (e.g. ~/.claude/skills/foo -> elsewhere): remove only
    // the link, never the target it points to.
    const st = await lstat(skillDir);
    if (st.isSymbolicLink()) {
      await unlink(skillDir);
    } else {
      await rm(skillDir, { recursive: true, force: true });
    }

    return c.json({ ok: true, skillId: idCheck.value });
  } catch (err) {
    if (err instanceof SyntaxError) return c.json({ error: "Invalid request body" }, 400);
    const message = err instanceof Error ? err.message : "Unknown error";
    return c.json({ error: message }, 500);
  }
});

export { skills };
