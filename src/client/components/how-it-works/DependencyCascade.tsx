type Level = "beginner" | "advanced";

type DependencyCascadeProps = {
  level: Level;
};

type CascadeEffect = {
  prefix: string;
  text: string;
  color: "red" | "green";
};

type CascadeItem = {
  action: string;
  badgeClass: string;
  effects: CascadeEffect[];
};

const CASCADE_ITEMS: CascadeItem[] = [
  {
    action: "Disable Plugin",
    badgeClass: "bg-red-500/15 text-red-400 ring-red-500/20",
    effects: [
      { prefix: "├──", text: "All Skills → disabled", color: "red" },
      { prefix: "├──", text: "Bundled MCPs → disabled", color: "red" },
      { prefix: "└──", text: "Other plugins → unaffected", color: "green" },
    ],
  },
  {
    action: "Disable Skill",
    badgeClass: "bg-amber-500/15 text-amber-400 ring-amber-500/20",
    effects: [
      { prefix: "├──", text: "Parent plugin → still active", color: "green" },
      { prefix: "├──", text: "Sibling skills → still active", color: "green" },
      { prefix: "└──", text: "Only this skill → disabled", color: "red" },
    ],
  },
  {
    action: "Disable MCP",
    badgeClass: "bg-blue-500/15 text-blue-400 ring-blue-500/20",
    effects: [
      { prefix: "├──", text: "MCP tools → unavailable", color: "red" },
      { prefix: "├──", text: "Parent plugin → still active", color: "green" },
      { prefix: "└──", text: "Plugin skills → still active", color: "green" },
    ],
  },
  {
    action: "Remove Hook",
    badgeClass: "bg-zinc-500/15 text-zinc-400 ring-zinc-500/20",
    effects: [
      { prefix: "├──", text: "Hook triggers → removed", color: "red" },
      { prefix: "└──", text: "All other config → unaffected", color: "green" },
    ],
  },
  {
    action: "Switch Profile (dashboard feature)",
    badgeClass: "bg-purple-500/15 text-purple-400 ring-purple-500/20",
    effects: [
      {
        prefix: "├──",
        text: "All current plugins → disabled first",
        color: "red",
      },
      {
        prefix: "├──",
        text: "Profile's plugins → enabled",
        color: "red",
      },
      {
        prefix: "└──",
        text: "Hooks, MCPs, skills → follow plugin state",
        color: "green",
      },
    ],
  },
];

const BEGINNER_EXAMPLE =
  "For example, if you disable the 'superpowers' plugin, you lose TDD, code review, brainstorming, and all other superpowers skills. But disabling just the 'code-review' skill keeps everything else from superpowers intact.";

const CascadeEffectLine = ({ effect }: { effect: CascadeEffect }) => {
  const colorClass =
    effect.color === "red" ? "text-red-400" : "text-emerald-400";

  return (
    <div className="flex gap-2">
      <span className="text-zinc-500 select-none">{effect.prefix}</span>
      <span className={colorClass}>{effect.text}</span>
    </div>
  );
};

const CascadeCard = ({ item }: { item: CascadeItem }) => {
  const effectLines = item.effects.map((effect) => (
    <CascadeEffectLine key={effect.text} effect={effect} />
  ));

  return (
    <div className="rounded-lg bg-[var(--surface-raised)] p-4 ring-1 ring-[var(--border-hairline)]">
      <span
        className={`inline-block rounded-full px-2.5 py-0.5 text-[11px] font-medium ring-1 mb-3 ${item.badgeClass}`}
      >
        {item.action}
      </span>
      <div className="text-[12px] font-mono space-y-0.5 ml-1">
        {effectLines}
      </div>
    </div>
  );
};

const CascadeList = () => {
  const cards = CASCADE_ITEMS.map((item) => (
    <CascadeCard key={item.action} item={item} />
  ));

  return <div className="space-y-3">{cards}</div>;
};

const BeginnerExample = () => (
  <div className="mt-4 rounded-lg bg-[var(--overlay-faint)] p-4 ring-1 ring-[var(--border-hairline)]">
    <p className="text-[12px] text-zinc-400 leading-relaxed">
      {BEGINNER_EXAMPLE}
    </p>
  </div>
);

export const DependencyCascade = ({ level }: DependencyCascadeProps) => {
  const isBeginner = level === "beginner";

  return (
    <div>
      <CascadeList />
      {isBeginner ? <BeginnerExample /> : null}
    </div>
  );
};
