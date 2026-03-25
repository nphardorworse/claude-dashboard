import { useWindowedUsage } from "../../hooks/use-windowed-usage";
import { LimitBar } from "./LimitBar";

type UsageWidgetProps = {
  selectedProjectPath: string | null;
};

export const UsageWidget = ({ selectedProjectPath: _selectedProjectPath }: UsageWidgetProps) => {
  const { data, isLoading } = useWindowedUsage();

  if (isLoading || !data) return null;

  return (
    <div className="border-t border-[var(--border-hairline)] px-5 py-4">
      <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-zinc-500">
        Plan Usage
      </p>

      <div className="mt-2.5 flex flex-col gap-3">
        <LimitBar
          label="Session (5hr)"
          messages={data.session.totalMessages}
          messageLimit={data.session.messageLimit}
          messagePercentage={data.session.messagePercentage}
          outputTokens={data.session.totalOutputTokens}
          resetsInMs={data.session.resetsInMs}
        />
        <LimitBar
          label="Weekly (7d)"
          messages={data.weekly.totalMessages}
          messageLimit={data.weekly.messageLimit}
          messagePercentage={data.weekly.messagePercentage}
          outputTokens={data.weekly.totalOutputTokens}
          resetsInMs={data.weekly.resetsInMs}
        />
      </div>

      <a
        href="#/usage"
        className="mt-3 block text-center text-[10px] text-zinc-500 transition-snappy hover:text-zinc-300"
      >
        View details &rsaquo;
      </a>
    </div>
  );
};
