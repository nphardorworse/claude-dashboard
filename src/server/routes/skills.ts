import { Hono } from "hono";
import { getProjectPath, getSettingsPath } from "../lib/paths";
import { readJsonFile, writeJsonFile, ensureDir } from "../lib/file-io";
import { scanSkills } from "../lib/skill-scanner";
import { dirname } from "path";
import type { SkillsResponse, SkillToggleRequest } from "../../shared/types";

type SettingsJson = {
  enabledSkills?: Record<string, boolean>;
  [key: string]: unknown;
};

const skills = new Hono();

skills.get("/", async (c) => {
  try {
    const projectPath = getProjectPath(c);
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

    if (!skillId || typeof enabled !== "boolean") {
      return c.json(
        { error: "Invalid request: skillId and enabled required" },
        400
      );
    }

    const projectPath = getProjectPath(c);
    const settingsPath = getSettingsPath(projectPath);

    if (projectPath) {
      await ensureDir(dirname(settingsPath));
    }

    const settings =
      (await readJsonFile<SettingsJson>(settingsPath)) ?? {};
    const enabledSkills = settings.enabledSkills ?? {};

    enabledSkills[skillId] = enabled;
    settings.enabledSkills = enabledSkills;

    await writeJsonFile(settingsPath, settings);

    return c.json({ ok: true, skillId, enabled });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return c.json({ error: message }, 500);
  }
});

export { skills };
