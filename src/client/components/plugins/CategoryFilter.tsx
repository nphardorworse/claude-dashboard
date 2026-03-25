import { useCallback } from "react";

export type CategoryItem = {
  value: string;
  label: string;
  prefix?: string;
};

type CategoryFilterProps = {
  categories: CategoryItem[];
  active: string;
  onChange: (category: string) => void;
};

type FilterTabProps = {
  item: CategoryItem;
  isActive: boolean;
  onClick: () => void;
};

const PREFIX_STYLES: Record<string, { classes: string; title: string }> = {
  PLG: { classes: "bg-indigo-500/15 text-indigo-400", title: "Plugin skill" },
  USR: { classes: "bg-emerald-500/15 text-emerald-400", title: "User-defined skill" },
  PRJ: { classes: "bg-amber-500/15 text-amber-400", title: "Project-scoped skill" },
};

const FilterTab = ({ item, isActive, onClick }: FilterTabProps) => {
  const activeClasses = "bg-blue-500/15 text-blue-400 ring-1 ring-blue-500/30";
  const inactiveClasses =
    "text-zinc-400 hover:bg-[var(--overlay-medium)] hover:text-zinc-200";

  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
        isActive ? activeClasses : inactiveClasses
      }`}
    >
      {item.prefix && (
        <span
          title={PREFIX_STYLES[item.prefix]?.title}
          className={`rounded px-1 py-px text-[9px] font-bold leading-none tracking-wider ${
            PREFIX_STYLES[item.prefix]?.classes ?? "bg-zinc-500/15 text-zinc-400"
          }`}
        >
          {item.prefix}
        </span>
      )}
      {item.label}
    </button>
  );
};

export const CategoryFilter = ({
  categories,
  active,
  onChange,
}: CategoryFilterProps) => {
  const handleClick = useCallback(
    (value: string) => () => {
      onChange(value);
    },
    [onChange]
  );

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <FilterTab
        item={{ value: "All", label: "All" }}
        isActive={active === "All"}
        onClick={handleClick("All")}
      />
      {categories.map((cat) => (
        <FilterTab
          key={cat.value}
          item={cat}
          isActive={active === cat.value}
          onClick={handleClick(cat.value)}
        />
      ))}
    </div>
  );
};
