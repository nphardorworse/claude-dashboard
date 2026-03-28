type TabItem = { label: string; description: string };

const TAB_ITEMS: TabItem[] = [
  {
    label: "Overview",
    description:
      "Health summary at a glance \u2014 4 metric cards, token cost chart, project analytics, warnings. Your starting point.",
  },
  {
    label: "Plugins",
    description:
      "Browse all 60+ installed plugins. Search, filter by category or status, toggle on/off per project. See estimated token cost per plugin.",
  },
  {
    label: "Skills",
    description:
      "Skills provided by your plugins. Toggle individual skills without affecting the parent plugin. See token cost estimates.",
  },
  {
    label: "MCP Servers",
    description:
      "Unified catalog from all 6 sources (global, plugin, project, cloud, etc.). Health status, add/remove servers, pin favorites, enable/disable per project.",
  },
  {
    label: "Hooks",
    description:
      "Shell commands that fire on Claude Code events. Add, edit, or remove hooks. See which events have hooks attached.",
  },
  {
    label: "Profiles",
    description:
      "Configuration presets for different workflows. Switch between core/mobile/web/science/full with one click, or save your current setup as a custom profile. Each profile stores plugins, skills, hooks, and MCP state.",
  },
  {
    label: "Usage",
    description:
      "Approximate session and weekly token consumption with per-project breakdown. Set your own tracking limits.",
  },
];

const TabCard = ({ item }: { item: TabItem }) => (
  <div className="rounded-xl bg-[var(--surface-raised)] p-4 ring-1 ring-[var(--border-hairline)]">
    <p className="text-[13px] font-semibold text-zinc-100 mb-1.5">
      {item.label}
    </p>
    <p className="text-[12px] text-zinc-400 leading-relaxed">
      {item.description}
    </p>
  </div>
);

const tabCards = TAB_ITEMS.map((item) => (
  <TabCard key={item.label} item={item} />
));

const TabCardList = () => <>{tabCards}</>;

export const WalkthroughGrid = () => (
  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
    <TabCardList />
  </div>
);
