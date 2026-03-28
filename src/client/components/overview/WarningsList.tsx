import { Card, CardContent } from "~/client/components/ui/card";
import type { HealthWarning } from "../../../shared/types";

type WarningsListProps = {
  warnings: HealthWarning[];
};

type WarningLevel = HealthWarning["level"];

const DOT_CLASSES: Record<WarningLevel, string> = {
  info: "bg-blue-400",
  warning: "bg-yellow-400",
  error: "bg-red-400",
};

const TEXT_CLASSES: Record<WarningLevel, string> = {
  info: "text-zinc-300",
  warning: "text-yellow-300",
  error: "text-red-300",
};

const LABEL_CLASSES: Record<WarningLevel, string> = {
  info: "text-blue-400",
  warning: "text-yellow-400",
  error: "text-red-400",
};

type WarningItemProps = {
  warning: HealthWarning;
};

const WarningItem = ({ warning }: WarningItemProps) => {
  const dotClass = DOT_CLASSES[warning.level];
  const textClass = TEXT_CLASSES[warning.level];
  const labelClass = LABEL_CLASSES[warning.level];

  return (
    <div className="flex items-start gap-3 py-2">
      <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${dotClass}`} />
      <div className="min-w-0 flex-1">
        <p className={`text-sm ${textClass}`}>{warning.message}</p>
        <p className={`mt-0.5 text-xs ${labelClass}`}>
          {warning.category}
        </p>
      </div>
    </div>
  );
};

export const WarningsList = ({ warnings }: WarningsListProps) => {
  if (warnings.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardContent>
        <h2 className="mb-3 text-sm font-semibold text-zinc-100">
          Notices & Warnings
        </h2>
        <div className="divide-y divide-[var(--border-hairline)]">
          {warnings.map((warning, index) => (
            <WarningItem key={`${warning.category}-${index}`} warning={warning} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
};
