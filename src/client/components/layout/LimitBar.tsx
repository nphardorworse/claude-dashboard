import { formatTokens, formatResetTime } from "../../lib/format";
import { getLimitBarColor, getLimitTextColor } from "../../lib/limit-colors";

type LimitBarProps = {
  label: string;
  messages: number;
  messageLimit: number | null;
  messagePercentage: number | null;
  outputTokens: number;
  resetsInMs: number;
};

export const LimitBar = ({
  label, messages, messageLimit, messagePercentage, outputTokens, resetsInMs,
}: LimitBarProps) => {
  const barColor = getLimitBarColor(messagePercentage);
  const labelColor = getLimitTextColor(messagePercentage);
  const clampedPct = messagePercentage != null ? Math.min(Math.max(messagePercentage, 2), 100) : 0;
  const hasLimit = messageLimit != null && messageLimit > 0;

  return (
    <div className="flex flex-col gap-1">
      {/* Header row */}
      <div className="flex items-baseline justify-between">
        <span className="text-[10px] font-medium text-zinc-400">{label}</span>
        <div className="flex items-baseline gap-2">
          {resetsInMs > 0 && (
            <span className="text-[9px] text-zinc-500">
              {formatResetTime(resetsInMs)}
            </span>
          )}
          {messagePercentage != null && (
            <span className={`font-mono text-[10px] font-medium tabular-nums ${labelColor}`}>
              {Math.round(messagePercentage)}%
            </span>
          )}
        </div>
      </div>

      {/* Messages (primary — what's rate-limited) */}
      <div className="flex items-baseline gap-1">
        <span className="font-mono text-[11px] font-semibold tabular-nums text-zinc-300">
          {messages}
        </span>
        {hasLimit ? (
          <span className={`text-[10px] ${labelColor}`}>
            / {messageLimit} msgs
          </span>
        ) : (
          <span className="text-[10px] text-zinc-500">messages</span>
        )}
        <span className="ml-auto text-[9px] text-zinc-500">
          {formatTokens(outputTokens)} out
        </span>
      </div>

      {/* Progress bar — always shown, fills proportionally when limit set */}
      <div className="h-[3px] w-full overflow-hidden rounded-full bg-[var(--overlay-subtle)]">
        <div
          className={`h-full rounded-full transition-[width] duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] ${hasLimit ? barColor : "bg-zinc-600"}`}
          style={{ width: hasLimit ? `${clampedPct}%` : `${Math.min(messages > 0 ? 100 : 0, 100)}%` }}
        />
      </div>
    </div>
  );
};
