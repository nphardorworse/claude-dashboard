import type { PluginInfo } from "../../../shared/types";
import { PluginCard } from "./PluginCard";

type PluginGridProps = {
  plugins: PluginInfo[];
  onToggle: (pluginId: string, enabled: boolean) => void;
  togglingIds: Set<string>;
};

export const PluginGrid = ({ plugins, onToggle, togglingIds }: PluginGridProps) => {
  if (plugins.length === 0) {
    return (
      <div className="rounded-xl bg-[var(--surface-raised)] ring-1 ring-[var(--border-hairline)] p-8 text-center">
        <p className="text-sm text-zinc-400">No plugins found.</p>
      </div>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-1 lg:grid-cols-2">
      {plugins.map((plugin) => (
        <PluginCard
          key={plugin.id}
          plugin={plugin}
          onToggle={onToggle}
          isToggling={togglingIds.has(plugin.id)}
        />
      ))}
    </div>
  );
};
