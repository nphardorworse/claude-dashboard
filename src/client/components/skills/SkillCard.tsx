import { useCallback } from "react";
import type { SkillInfo, EnableSource, TokenLevel } from "../../../shared/types";
import { Toggle } from "../shared/Toggle";
import { Badge } from "../shared/Badge";
import { Card, CardContent } from "~/client/components/ui/card";

const SOURCE_LABELS: Record<EnableSource, string> = {
  global: "global",
  project: "project override",
  default: "default",
};

const TOKEN_LABELS: Record<TokenLevel, string> = {
  low: "Low cost",
  medium: "Medium cost",
  high: "High cost",
};

const formatTokens = (tokens: number): string => {
  if (tokens >= 1000) {
    return `~${Math.round(tokens / 1000)}k`;
  }
  return `~${tokens}`;
};

const SOURCE_BADGE_VARIANT: Record<string, string> = {
  user: "bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/20",
  plugin: "bg-violet-500/10 text-violet-400 ring-1 ring-violet-500/20",
  project: "bg-sky-500/10 text-sky-400 ring-1 ring-sky-500/20",
};

type SkillCardProps = {
  skill: SkillInfo;
  onToggle: (skillId: string, enabled: boolean) => void;
  isToggling: boolean;
};

export const SkillCard = ({ skill, onToggle, isToggling }: SkillCardProps) => {
  const handleToggle = useCallback(
    (checked: boolean) => {
      onToggle(skill.id, checked);
    },
    [onToggle, skill.id]
  );

  const toggleDisabled = isToggling || !skill.parentPluginEnabled;

  return (
    <Card
      className={`group hover:ring-[var(--border-accent)] ${
        skill.enabled && skill.parentPluginEnabled ? "" : "opacity-50"
      }`}
    >
      <CardContent className="p-4">
        <div className="flex items-center justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2.5">
            <h3 className="truncate text-[13px] font-semibold text-zinc-100">
              {skill.name}
            </h3>
            <span
              className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-medium tracking-wide ring-inset ${
                SOURCE_BADGE_VARIANT[skill.source]
              }`}
            >
              {skill.source === "plugin" ? skill.pluginName ?? "plugin" : skill.source}
            </span>
          </div>

          {skill.description && (
            <p className="mt-1.5 line-clamp-2 text-[11px] text-zinc-400">
              <span className="text-zinc-500">Triggers when: </span>
              {skill.description}
            </p>
          )}

          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            <Badge
              label={`${TOKEN_LABELS[skill.tokenLevel]} (${formatTokens(skill.estimatedTokens)})`}
              variant={skill.tokenLevel}
            />
            {!skill.parentPluginEnabled && (
              <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-400 ring-1 ring-inset ring-amber-500/20">
                Plugin disabled
              </span>
            )}
            {skill.enableSource && skill.enableSource !== "default" && (
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                  skill.enableSource === "project"
                    ? "bg-blue-500/10 text-blue-400 ring-1 ring-blue-500/20"
                    : "text-zinc-500"
                }`}
              >
                {SOURCE_LABELS[skill.enableSource]}
              </span>
            )}
          </div>
        </div>

        <div className="shrink-0" title={!skill.parentPluginEnabled ? "Enable the parent plugin first" : undefined}>
          <Toggle
            checked={skill.enabled}
            onChange={handleToggle}
            disabled={toggleDisabled}
          />
        </div>
        </div>
      </CardContent>
    </Card>
  );
};
