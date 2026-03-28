type Level = "beginner" | "advanced";

type LevelToggleProps = {
  level: Level;
  onChangeLevel: (level: Level) => void;
};

export const LevelToggle = ({ level, onChangeLevel }: LevelToggleProps) => {
  const handleBeginner = () => onChangeLevel("beginner");
  const handleAdvanced = () => onChangeLevel("advanced");

  const activeClass =
    "bg-[var(--overlay-subtle)] text-zinc-100 font-medium rounded-md px-4 py-1.5 text-[13px] transition-colors active:scale-[0.96]";
  const inactiveClass =
    "text-zinc-400 hover:text-zinc-300 px-4 py-1.5 text-[13px] rounded-md transition-colors active:scale-[0.96]";

  return (
    <div
      className="bg-[var(--surface-raised)] rounded-lg p-1 inline-flex gap-0.5"
      role="radiogroup"
      aria-label="Content detail level"
    >
      <button
        className={level === "beginner" ? activeClass : inactiveClass}
        role="radio"
        aria-checked={level === "beginner"}
        onClick={handleBeginner}
      >
        Beginner
      </button>
      <button
        className={level === "advanced" ? activeClass : inactiveClass}
        role="radio"
        aria-checked={level === "advanced"}
        onClick={handleAdvanced}
      >
        Advanced
      </button>
    </div>
  );
};
