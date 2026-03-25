import { useState, useCallback } from "react";

type McpOriginGroupProps = {
  label: string;
  count: number;
  defaultOpen?: boolean;
  children: React.ReactNode;
};

type GroupHeaderProps = {
  label: string;
  count: number;
  isOpen: boolean;
  onToggle: () => void;
};

const GroupHeader = ({ label, count, isOpen, onToggle }: GroupHeaderProps) => {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex w-full items-center gap-2 rounded-lg px-1 py-1 transition-snappy hover:bg-[var(--overlay-faint)]"
    >
      <span className="text-[11px] text-zinc-500 transition-snappy">
        {isOpen ? "▾" : "▸"}
      </span>
      <span className="text-[11px] font-semibold uppercase tracking-[0.15em] text-zinc-500">
        {label}
      </span>
      <span className="rounded-full bg-[var(--overlay-faint)] px-2 py-0.5 text-[10px] text-zinc-600">
        {count}
      </span>
    </button>
  );
};

const McpOriginGroup = ({
  label,
  count,
  defaultOpen = true,
  children,
}: McpOriginGroupProps) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  const handleToggle = useCallback(() => {
    setIsOpen((prev) => !prev);
  }, []);

  return (
    <div className="flex flex-col gap-2">
      <GroupHeader
        label={label}
        count={count}
        isOpen={isOpen}
        onToggle={handleToggle}
      />
      {isOpen && <div className="flex flex-col gap-2 pl-4">{children}</div>}
    </div>
  );
};

export { McpOriginGroup };
