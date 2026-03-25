import type { ReactNode } from "react";

type ConceptCardProps = {
  icon: ReactNode;
  title: string;
  description: string;
};

export const ConceptCard = ({ icon, title, description }: ConceptCardProps) => (
  <div className="rounded-2xl bg-[var(--overlay-faint)] p-[1px] ring-1 ring-[var(--border-hairline)]">
    <div className="rounded-[calc(1rem-1px)] bg-[var(--surface-raised)] p-5 shadow-[inset_0_1px_1px_var(--glow-inset)]">
      <div className="w-8 h-8 rounded-lg bg-[var(--overlay-subtle)] flex items-center justify-center text-zinc-400 mb-3">
        {icon}
      </div>
      <h3 className="text-[13px] font-semibold text-zinc-100 mb-2">{title}</h3>
      <p className="text-[12px] text-zinc-400 leading-relaxed">{description}</p>
    </div>
  </div>
);
