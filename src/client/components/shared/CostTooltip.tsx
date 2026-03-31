import type { TurnUsage } from "../../../shared/types";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "~/client/components/ui/tooltip";

type CostTooltipProps = {
  turn: TurnUsage;
  children: React.ReactNode;
};

const formatTokens = (tokens: number): string => {
  if (tokens === 0) return "0";
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1)}k`;
  return String(tokens);
};

const formatCostLine = (cost: number): string => {
  if (cost < 0.001 && cost > 0) return "<$0.001";
  if (cost < 0.01) return `$${cost.toFixed(3)}`;
  return `$${cost.toFixed(2)}`;
};

type RowProps = {
  label: string;
  tokens: number;
  cost: number;
  colorClass: string;
};

const Row = ({ label, tokens, cost, colorClass }: RowProps) => (
  <div className="flex items-center gap-2">
    <span className={`w-[72px] text-right tabular-nums ${colorClass}`}>
      {formatTokens(tokens)}
    </span>
    <span className="w-[58px] truncate text-zinc-500">{label}</span>
    <span className="w-[52px] text-right tabular-nums text-zinc-300">
      {formatCostLine(cost)}
    </span>
  </div>
);

export const CostTooltip = ({ turn, children }: CostTooltipProps) => (
  <TooltipProvider>
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent
        side="top"
        sideOffset={4}
        className="bg-zinc-900 px-3 py-2.5 font-mono text-[10px] shadow-xl ring-1 ring-[var(--border-hairline)]"
      >
        <div className="flex flex-col gap-0.5">
          <Row
            label="Input"
            tokens={turn.inputTokens}
            cost={turn.inputCostUSD}
            colorClass="text-blue-400"
          />
          <Row
            label="Output"
            tokens={turn.outputTokens}
            cost={turn.outputCostUSD}
            colorClass="text-rose-400"
          />
          <Row
            label="Cache W"
            tokens={turn.cacheCreationTokens}
            cost={turn.cacheWriteCostUSD}
            colorClass="text-amber-400"
          />
          <Row
            label="Cache R"
            tokens={turn.cacheReadTokens}
            cost={turn.cacheReadCostUSD}
            colorClass="text-emerald-400"
          />
        </div>
        <div className="mt-1.5 flex items-center justify-between border-t border-zinc-700 pt-1.5">
          <span className="text-zinc-500">
            {turn.apiCallCount} API call{turn.apiCallCount !== 1 ? "s" : ""}
          </span>
          <span className="font-semibold text-zinc-200">
            {formatCostLine(turn.costUSD)}
          </span>
        </div>
      </TooltipContent>
    </Tooltip>
  </TooltipProvider>
);
