import { useState, useEffect } from "react";

const STORAGE_KEY = "cost-explainer-open";

export const CostExplainer = () => {
  const [open, setOpen] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === "true";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, String(open));
    } catch {
      // ignore
    }
  }, [open]);

  return (
    <div className="rounded-lg ring-1 ring-[var(--border-hairline)] bg-[var(--overlay-faint)]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-[11px] font-medium text-zinc-400 transition-colors hover:text-zinc-300"
      >
        <svg
          viewBox="0 0 16 16"
          fill="currentColor"
          className={`h-3 w-3 transition-transform duration-200 ${open ? "rotate-90" : ""}`}
        >
          <path d="M6 3l5 5-5 5V3z" />
        </svg>
        How costs work
      </button>

      {open && (
        <div className="border-t border-[var(--border-hairline)] px-3 pb-3 pt-2">
          <h5 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
            Terminology
          </h5>
          <div className="mb-3 flex flex-col gap-1">
            <TermRow term="Message" desc="One user prompt you type. This is what Anthropic rate-limits on." />
            <TermRow term="Turn" desc="One message + all of Claude's work until your next message." />
            <TermRow term="API Calls" desc="Individual requests to Claude within a turn. Each tool-call loop = 1 API call. A single turn can have 1–50+ API calls." />
          </div>

          <h5 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
            Cost Categories
          </h5>
          <div className="flex flex-col gap-1">
            <CategoryRow color="bg-blue-400" label="Input" desc="Non-cached tokens sent to Claude" price="base rate" />
            <CategoryRow color="bg-rose-400" label="Output" desc="Tokens Claude generates" price="5× input" />
            <CategoryRow color="bg-amber-400" label="Cache Write" desc="First-time caching of prompt tokens" price="1.25× input" />
            <CategoryRow color="bg-emerald-400" label="Cache Read" desc="Reusing cached tokens" price="0.1× input" />
          </div>

          <p className="mt-2 text-[9px] text-zinc-600">
            Costs computed per-API-call using Anthropic's published per-model rates.
          </p>
        </div>
      )}
    </div>
  );
};

const TermRow = ({ term, desc }: { term: string; desc: string }) => (
  <div className="flex gap-2 text-[10px]">
    <span className="w-[70px] shrink-0 font-semibold text-zinc-300">{term}</span>
    <span className="text-zinc-500">{desc}</span>
  </div>
);

const CategoryRow = ({
  color,
  label,
  desc,
  price,
}: {
  color: string;
  label: string;
  desc: string;
  price: string;
}) => (
  <div className="flex items-center gap-2 text-[10px]">
    <span className={`h-2 w-2 shrink-0 rounded-sm ${color}`} />
    <span className="w-[72px] shrink-0 font-semibold text-zinc-300">{label}</span>
    <span className="flex-1 text-zinc-500">{desc}</span>
    <span className="shrink-0 text-zinc-600">{price}</span>
  </div>
);
