import type { ReactNode } from "react";

type SectionBlockProps = {
  title: string;
  children: ReactNode;
};

export const SectionBlock = ({ title, children }: SectionBlockProps) => (
  <section className="border-t border-[var(--border-hairline)] pt-8 mt-8">
    <h2 className="text-base font-semibold text-zinc-100 mb-4">{title}</h2>
    {children}
  </section>
);
