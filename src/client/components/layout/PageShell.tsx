import type { ReactNode } from "react";

type PageShellProps = {
  title: string;
  children: ReactNode;
};

export const PageShell = ({ title, children }: PageShellProps) => {
  return (
    <div className="relative z-10 flex-1 overflow-y-auto px-10 py-10">
      <h1 className="mb-8 text-xl font-bold tracking-tight text-zinc-100" style={{ textWrap: "balance" }}>
        {title}
      </h1>
      <div>{children}</div>
    </div>
  );
};
