import { useCallback } from "react";

type CategoryFilterProps = {
  categories: string[];
  active: string;
  onChange: (category: string) => void;
};

type FilterTabProps = {
  label: string;
  isActive: boolean;
  onClick: () => void;
};

const FilterTab = ({ label, isActive, onClick }: FilterTabProps) => {
  const activeClasses = "bg-blue-500/15 text-blue-400 ring-1 ring-blue-500/30";
  const inactiveClasses =
    "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200";

  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
        isActive ? activeClasses : inactiveClasses
      }`}
    >
      {label}
    </button>
  );
};

export const CategoryFilter = ({
  categories,
  active,
  onChange,
}: CategoryFilterProps) => {
  const handleClick = useCallback(
    (category: string) => () => {
      onChange(category);
    },
    [onChange]
  );

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <FilterTab
        label="All"
        isActive={active === "All"}
        onClick={handleClick("All")}
      />
      {categories.map((cat) => (
        <FilterTab
          key={cat}
          label={cat}
          isActive={active === cat}
          onClick={handleClick(cat)}
        />
      ))}
    </div>
  );
};
