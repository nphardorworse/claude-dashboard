import type { SkillInfo } from "../../../shared/types";
import { SkillCard } from "./SkillCard";

type SkillGridProps = {
  skills: SkillInfo[];
  onToggle: (skillId: string, enabled: boolean) => void;
  onDelete: (skillId: string) => void;
  togglingIds: Set<string>;
  deletingIds: Set<string>;
};

export const SkillGrid = ({ skills, onToggle, onDelete, togglingIds, deletingIds }: SkillGridProps) => {
  if (skills.length === 0) {
    return (
      <div className="rounded-xl bg-[var(--surface-raised)] ring-1 ring-[var(--border-hairline)] p-8 text-center">
        <p className="text-sm text-zinc-400">No skills found.</p>
      </div>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-1 lg:grid-cols-2">
      {skills.map((skill) => (
        <SkillCard
          key={skill.id}
          skill={skill}
          onToggle={onToggle}
          onDelete={onDelete}
          isToggling={togglingIds.has(skill.id)}
          isDeleting={deletingIds.has(skill.id)}
        />
      ))}
    </div>
  );
};
