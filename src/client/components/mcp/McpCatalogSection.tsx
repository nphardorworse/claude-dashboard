import { useState, useCallback } from "react";

type McpCatalogSectionProps = {
  title: string;
  count: number;
  children: React.ReactNode;
  defaultOpen?: boolean;
};

type SectionHeaderProps = {
  title: string;
  count: number;
  isOpen: boolean;
  onToggle: () => void;
};

const SectionHeader = ({
  title,
  count,
  isOpen,
  onToggle,
}: SectionHeaderProps) => {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex w-full items-center gap-3 transition-snappy hover:opacity-80"
    >
      <div className="h-px flex-1 bg-[var(--border-hairline)]" />
      <span className="flex shrink-0 items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.15em] text-zinc-400">
        <span className="transition-snappy">{isOpen ? "▾" : "▸"}</span>
        {title}
        <span className="font-normal text-zinc-500">({count})</span>
      </span>
      <div className="h-px flex-1 bg-[var(--border-hairline)]" />
    </button>
  );
};

const McpCatalogSection = ({
  title,
  count,
  children,
  defaultOpen = true,
}: McpCatalogSectionProps) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  const handleToggle = useCallback(() => {
    setIsOpen((prev) => !prev);
  }, []);

  return (
    <div className="flex flex-col gap-3">
      <SectionHeader
        title={title}
        count={count}
        isOpen={isOpen}
        onToggle={handleToggle}
      />
      {isOpen && <div className="flex flex-col gap-2">{children}</div>}
    </div>
  );
};

export { McpCatalogSection };
