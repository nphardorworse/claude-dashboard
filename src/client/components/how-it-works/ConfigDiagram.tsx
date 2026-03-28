type Level = "beginner" | "advanced";

type ConfigDiagramProps = {
  level: Level;
};

const TEXT_PRIMARY = "var(--text-primary)";
const TEXT_MUTED = "var(--text-muted, #a1a1aa)";
const LINE_STROKE = "var(--border-hairline)";

const RECT_WIDTH = 400;
const RECT_HEIGHT = 45;
const CENTER_X = 300;

const layers = [
  { y: 20, label: "Project", path: ".claude/settings.json", highlight: true },
  { y: 85, label: "Global", path: "~/.claude/settings.json", highlight: false },
  {
    y: 150,
    label: "Default",
    path: "plugin installed = enabled",
    highlight: false,
  },
] as const;

const ArrowWithLabel = ({ y }: { y: number }) => (
  <g>
    <line
      x1={CENTER_X}
      y1={y}
      x2={CENTER_X}
      y2={y + 18}
      stroke={LINE_STROKE}
      strokeWidth={2}
    />
    <polygon
      points={`${CENTER_X - 4},${y + 14} ${CENTER_X + 4},${y + 14} ${CENTER_X},${y + 20}`}
      fill={LINE_STROKE}
    />
    <text
      x={CENTER_X + 16}
      y={y + 14}
      fontSize={10}
      fill={TEXT_MUTED}
      textAnchor="start"
    >
      falls through if not set
    </text>
  </g>
);

const PriorityLabels = () => (
  <g fontSize={10} fill={TEXT_MUTED} fontStyle="italic">
    <text x={60} y={47} textAnchor="middle">
      Highest
    </text>
    <text x={60} y={59} textAnchor="middle">
      priority
    </text>
    <text x={60} y={177} textAnchor="middle">
      Lowest
    </text>
    <text x={60} y={189} textAnchor="middle">
      priority
    </text>
  </g>
);

const BEGINNER_EXPLANATION =
  "When you customize a setting for a specific project, it overrides the global setting. If no project setting exists, the global one applies. If neither exists, the default kicks in. There are also settings.local.json files (both global and per-project) for machine-specific settings like permissions — these are gitignored so they don't travel with your repo.";

const BeginnerExplanation = () => (
  <p className="text-[12px] text-zinc-400 leading-relaxed mt-4 max-w-[480px] mx-auto text-center">
    {BEGINNER_EXPLANATION}
  </p>
);

export const ConfigDiagram = ({ level }: ConfigDiagramProps) => {
  const isBeginner = level === "beginner";

  const layerElements = layers.map((layer) => (
    <g key={layer.label}>
      <rect
        x={CENTER_X - RECT_WIDTH / 2}
        y={layer.y}
        width={RECT_WIDTH}
        height={RECT_HEIGHT}
        fill={
          layer.highlight
            ? "var(--overlay-subtle)"
            : "var(--overlay-faint, var(--surface-raised))"
        }
        stroke={LINE_STROKE}
        strokeWidth={2}
        rx={8}
      />
      <text
        x={CENTER_X - RECT_WIDTH / 2 + 20}
        y={layer.y + 28}
        fontSize={13}
        fontWeight={600}
        fill={TEXT_PRIMARY}
      >
        {layer.label}
      </text>
      <text
        x={CENTER_X + RECT_WIDTH / 2 - 20}
        y={layer.y + 28}
        fontSize={11}
        fill={TEXT_MUTED}
        textAnchor="end"
      >
        {layer.path}
      </text>
    </g>
  ));

  return (
    <div className="rounded-xl bg-[var(--surface-raised)] p-5 ring-1 ring-[var(--border-hairline)] overflow-x-auto">
      <svg
        viewBox="0 0 600 200"
        role="img"
        aria-label="Config resolution priority diagram showing project, global, and default layers"
        style={{ minWidth: 400, maxWidth: "100%" }}
      >
        <PriorityLabels />

        {layerElements}

        <ArrowWithLabel y={65} />
        <ArrowWithLabel y={130} />
      </svg>

      {isBeginner ? <BeginnerExplanation /> : null}
    </div>
  );
};
