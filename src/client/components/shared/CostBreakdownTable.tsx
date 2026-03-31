import type { CostBreakdown } from "../../../shared/types";

type CostBreakdownTableProps = {
  data: CostBreakdown;
};

const formatTokens = (tokens: number): string => {
  if (tokens === 0) return "0";
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1)}k`;
  return String(tokens);
};

const formatCost = (cost: number): string => {
  if (cost < 0.01 && cost > 0) return "<$0.01";
  if (cost >= 1000) return `$${Math.round(cost).toLocaleString()}`;
  return `$${cost.toFixed(2)}`;
};

type CategoryRowProps = {
  color: string;
  label: string;
  tokens: number;
  cost: number;
  pct: number;
};

const CategoryTableRow = ({ color, label, tokens, cost, pct }: CategoryRowProps) => (
  <tr className="border-b border-[var(--border-hairline)] text-[11px]">
    <td className="flex items-center gap-2 px-2 py-1.5">
      <span className={`h-2 w-2 shrink-0 rounded-sm ${color}`} />
      <span className="font-medium text-zinc-300">{label}</span>
    </td>
    <td className="px-2 py-1.5 text-right font-mono tabular-nums text-zinc-400">
      {formatTokens(tokens)}
    </td>
    <td className="px-2 py-1.5 text-right font-mono tabular-nums text-zinc-200">
      {formatCost(cost)}
    </td>
    <td className="px-2 py-1.5 text-right font-mono tabular-nums text-zinc-500">
      {pct > 0 ? `${pct.toFixed(1)}%` : "-"}
    </td>
  </tr>
);

export const CostBreakdownTable = ({ data }: CostBreakdownTableProps) => {
  const total =
    data.inputCostUSD +
    data.outputCostUSD +
    data.cacheWriteCostUSD +
    data.cacheReadCostUSD;

  const pct = (v: number) => (total > 0 ? (v / total) * 100 : 0);

  if (total === 0) return null;

  return (
    <div>
      <h4 className="mb-2 text-xs font-semibold text-zinc-300">
        Cost Breakdown
      </h4>
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-[var(--border-accent)]">
              <th className="px-2 py-1 text-[10px] font-medium text-zinc-500">
                Category
              </th>
              <th className="px-2 py-1 text-right text-[10px] font-medium text-zinc-500">
                Tokens
              </th>
              <th className="px-2 py-1 text-right text-[10px] font-medium text-zinc-500">
                Cost
              </th>
              <th className="px-2 py-1 text-right text-[10px] font-medium text-zinc-500">
                % of Total
              </th>
            </tr>
          </thead>
          <tbody>
            <CategoryTableRow
              color="bg-blue-400"
              label="Input"
              tokens={data.inputTokens}
              cost={data.inputCostUSD}
              pct={pct(data.inputCostUSD)}
            />
            <CategoryTableRow
              color="bg-rose-400"
              label="Output"
              tokens={data.outputTokens}
              cost={data.outputCostUSD}
              pct={pct(data.outputCostUSD)}
            />
            <CategoryTableRow
              color="bg-amber-400"
              label="Cache Write"
              tokens={data.cacheWriteTokens}
              cost={data.cacheWriteCostUSD}
              pct={pct(data.cacheWriteCostUSD)}
            />
            <CategoryTableRow
              color="bg-emerald-400"
              label="Cache Read"
              tokens={data.cacheReadTokens}
              cost={data.cacheReadCostUSD}
              pct={pct(data.cacheReadCostUSD)}
            />
          </tbody>
        </table>
      </div>
    </div>
  );
};
