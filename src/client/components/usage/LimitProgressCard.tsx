import { formatTokens, formatResetTime } from "../../lib/format";
import { getLimitBarColor, getLimitGlow } from "../../lib/limit-colors";

type LimitProgressCardProps = {
  title: string;
  messages: number;
  messageLimit: number | null;
  messagePercentage: number | null;
  outputTokens: number;
  inputTokens: number;
  totalSessions: number;
  resetsInMs: number;
};

const getValueColor = (pct: number | null): string => {
  if (pct == null) return "text-zinc-50";
  if (pct >= 90) return "text-red-400";
  if (pct >= 70) return "text-amber-400";
  return "text-zinc-50";
};

export const LimitProgressCard = ({
  title,
  messages,
  messageLimit,
  messagePercentage,
  outputTokens,
  inputTokens,
  totalSessions,
  resetsInMs,
}: LimitProgressCardProps) => {
  const hasLimit = messageLimit != null && messageLimit > 0;
  const barColor = getLimitBarColor(messagePercentage);
  const valueColor = getValueColor(messagePercentage);
  const glowClass = getLimitGlow(messagePercentage);
  const clampedPct = messagePercentage != null ? Math.min(Math.max(messagePercentage, 2), 100) : 0;

  return (
    <div className={`rounded-2xl bg-[var(--overlay-faint)] p-[1px] ring-1 ring-[var(--border-hairline)] ${glowClass}`}>
      <div className="rounded-[calc(1rem-1px)] bg-[var(--surface-raised)] p-5 shadow-[inset_0_1px_1px_var(--glow-inset)]">
        {/* Header */}
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-zinc-500">
            {title}
          </p>
          {resetsInMs > 0 && (
            <span className="text-[10px] text-zinc-500">
              Resets in {formatResetTime(resetsInMs)}
            </span>
          )}
        </div>

        {/* Main value — messages (rate-limited) */}
        <div className="mt-3 flex items-baseline gap-2">
          <span className={`text-2xl font-bold tracking-tight ${valueColor}`}>
            {messages}
          </span>
          {hasLimit ? (
            <span className="text-[13px] text-zinc-500">
              / {messageLimit} messages
            </span>
          ) : (
            <span className="text-[13px] text-zinc-500">messages</span>
          )}
          {messagePercentage != null && (
            <span className={`ml-auto font-mono text-sm font-semibold ${valueColor}`}>
              {Math.round(messagePercentage)}%
            </span>
          )}
        </div>

        {/* Progress bar — always visible */}
        <div className="mt-3 h-[5px] w-full overflow-hidden rounded-full bg-[var(--overlay-subtle)]">
          <div
            className={`h-full rounded-full transition-all duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] ${hasLimit ? barColor : "bg-zinc-600"}`}
            style={{ width: hasLimit ? `${clampedPct}%` : `${Math.min(messages > 0 ? 100 : 0, 100)}%` }}
          />
        </div>

        {/* Subtitle — token context */}
        <p className="mt-2.5 text-[11px] text-zinc-500">
          {formatTokens(outputTokens)} out · {formatTokens(inputTokens)} in · {totalSessions} session{totalSessions !== 1 ? "s" : ""}
        </p>
      </div>
    </div>
  );
};
