import { useCallback } from "react";
import type { PluginInfo, PluginEnableSource } from "../../../shared/types";
import { Toggle } from "../shared/Toggle";
import { Badge } from "../shared/Badge";
import { TrashIcon } from "../shared/NavIcons";
import { Button } from "~/client/components/ui/button";
import { Card, CardContent } from "~/client/components/ui/card";
import type { TokenLevel } from "../../../shared/types";

const SOURCE_LABELS: Record<PluginEnableSource, string> = {
  global: "global",
  project: "project override",
  default: "default",
};

type PluginCardProps = {
  plugin: PluginInfo;
  onToggle: (pluginId: string, enabled: boolean) => void;
  onDelete: (pluginId: string) => void;
  isToggling: boolean;
  isDeleting: boolean;
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

const PluginTypeBadges = ({
  hasAgents,
  hasSkills,
  hasMcp,
}: Pick<PluginInfo, "hasAgents" | "hasSkills" | "hasMcp">) => {
  return (
    <>
      {hasAgents && <Badge label="Agent" variant="info" />}
      {hasSkills && <Badge label="Skill" variant="info" />}
      {hasMcp && <Badge label="MCP" variant="info" />}
    </>
  );
};

export const PluginCard = ({ plugin, onToggle, onDelete, isToggling, isDeleting }: PluginCardProps) => {
  const handleToggle = useCallback(
    (checked: boolean) => {
      onToggle(plugin.id, checked);
    },
    [onToggle, plugin.id]
  );

  const handleDelete = useCallback(() => {
    onDelete(plugin.id);
  }, [onDelete, plugin.id]);

  return (
    <Card
      className={`group hover:ring-[var(--border-accent)] ${
        plugin.enabled ? "" : "opacity-50"
      }`}
    >
      <CardContent className="p-4">
        <div className="flex items-center justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2.5">
            <h3 className="truncate text-[13px] font-semibold text-zinc-100">
              {plugin.name}
            </h3>
            <Badge label={plugin.marketplace} variant="info" />
          </div>

          {plugin.description && (
            <p className="mt-1.5 line-clamp-2 text-[11px] text-zinc-400">
              {plugin.description}
            </p>
          )}

          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            <Badge
              label={`${TOKEN_LABELS[plugin.tokenLevel]} (${formatTokens(plugin.activeEstimatedTokens)})`}
              variant={plugin.tokenLevel}
            />
            <PluginTypeBadges
              hasAgents={plugin.hasAgents}
              hasSkills={plugin.hasSkills}
              hasMcp={plugin.hasMcp}
            />
            {plugin.enableSource && plugin.enableSource !== "default" && (
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                plugin.enableSource === "project"
                  ? "bg-blue-500/10 text-blue-400 ring-1 ring-blue-500/20"
                  : "text-zinc-500"
              }`}>
                {SOURCE_LABELS[plugin.enableSource]}
              </span>
            )}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={handleDelete}
            disabled={isDeleting}
            title="Uninstall plugin"
            aria-label="Uninstall plugin"
            className="text-zinc-500 opacity-0 transition-opacity hover:text-red-400 group-hover:opacity-100 focus-visible:opacity-100"
          >
            <TrashIcon />
          </Button>
          <Toggle
            checked={plugin.enabled}
            onChange={handleToggle}
            disabled={isToggling}
          />
        </div>
        </div>
      </CardContent>
    </Card>
  );
};
