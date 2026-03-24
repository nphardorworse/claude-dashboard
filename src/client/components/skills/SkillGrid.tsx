import type { SkillInfo } from "../../../shared/types";
import { SkillCard } from "./SkillCard";

type SkillGridProps = {
  skills: SkillInfo[];
  onToggle: (skillId: string, enabled: boolean) => void;
  togglingIds: Set<string>;
};

export const SkillGrid = ({ skills, onToggle, togglingIds }: SkillGridProps) => {
  if (skills.length === 0) {
    return (
      <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-8 text-center">
        <p className="text-sm text-zinc-400">No skills found.</p>
      </div>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-1 lg:grid-cols-2">
      {skills.map((skill) => (
        <SkillCard
          key={skill.id}
          skill={skill}
          onToggle={onToggle}
          isToggling={togglingIds.has(skill.id)}
        />
      ))}
    </div>
  );
};
