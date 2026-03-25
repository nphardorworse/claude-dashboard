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
      <div className="rounded-2xl bg-[var(--overlay-faint)] p-[1px] ring-1 ring-[var(--border-hairline)]">
        <div className="rounded-[calc(1rem-1px)] bg-[var(--surface-raised)] p-8 text-center shadow-[inset_0_1px_1px_var(--glow-inset)]">
          <p className="text-sm text-zinc-400">No skills found.</p>
        </div>
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
