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
      <div className="rounded-2xl bg-[var(--overlay-faint)] p-[1px] ring-1 ring-[var(--border-hairline)]">
        <div className="rounded-[calc(1rem-1px)] bg-[var(--surface-raised)] p-8 text-center shadow-[inset_0_1px_1px_var(--glow-inset)]">
          <p className="text-sm text-zinc-400">No plugins found.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-1 lg:grid-cols-2">
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
