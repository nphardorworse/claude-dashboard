type Level = "beginner" | "advanced";

type EcosystemDiagramProps = {
  level: Level;
};

const NODE_STYLE = {
  fill: "var(--surface-raised)",
  stroke: "var(--border-hairline)",
  strokeWidth: 1.5,
  rx: 10,
};

const CENTER_NODE_STYLE = {
  fill: "var(--overlay-subtle)",
  stroke: "var(--border-hairline)",
  strokeWidth: 2,
  rx: 10,
};

const TEXT_PRIMARY = "var(--text-primary)";
const TEXT_MUTED = "var(--text-muted, #a1a1aa)";
const LINE_STROKE = "var(--border-hairline)";

const BeginnerAnnotations = () => (
  <g fontSize={10} fill={TEXT_MUTED}>
    <text x={160} y={105} textAnchor="middle">
      Add capabilities like code review, TDD
    </text>
    <text x={640} y={105} textAnchor="middle">
      External tools &amp; data sources
    </text>
    <text x={160} y={365} textAnchor="middle">
      Auto-run on events (e.g. before tool use)
    </text>
    <text x={640} y={365} textAnchor="middle">
      Plugin presets for different workflows
    </text>
    <text x={95} y={195} textAnchor="middle">
      Individual features
    </text>
    <text x={95} y={207} textAnchor="middle">
      from plugins
    </text>
    <text x={225} y={195} textAnchor="middle">
      Bundled server
    </text>
    <text x={225} y={207} textAnchor="middle">
      configs
    </text>
  </g>
);

export const EcosystemDiagram = ({ level }: EcosystemDiagramProps) => {
  const isBeginner = level === "beginner";
  const viewBox = isBeginner ? "0 0 800 420" : "0 0 800 320";
  const centerY = isBeginner ? 190 : 140;
  const bottomY = isBeginner ? 310 : 240;

  return (
    <div className="rounded-xl bg-[var(--surface-raised)] p-5 ring-1 ring-[var(--border-hairline)] overflow-x-auto">
      <svg
        viewBox={viewBox}
        role="img"
        aria-label="Ecosystem diagram showing how Claude Code components connect"
        style={{ minWidth: 500, maxWidth: "100%" }}
      >
        {/* Center node */}
        <rect
          x={290}
          y={centerY}
          width={220}
          height={50}
          {...CENTER_NODE_STYLE}
        />
        <text
          x={400}
          y={centerY + 30}
          textAnchor="middle"
          fontSize={14}
          fontWeight="bold"
          fill={TEXT_PRIMARY}
        >
          Claude Code Session
        </text>

        {/* Top-left: Plugins */}
        <rect x={80} y={40} width={160} height={44} {...NODE_STYLE} />
        <text
          x={160}
          y={67}
          textAnchor="middle"
          fontSize={13}
          fontWeight={600}
          fill={TEXT_PRIMARY}
        >
          Plugins
        </text>

        {/* Sub-nodes: Skills and MCPs */}
        <rect x={50} y={120} width={90} height={32} {...NODE_STYLE} />
        <text
          x={95}
          y={141}
          textAnchor="middle"
          fontSize={11}
          fill={TEXT_PRIMARY}
        >
          Skills
        </text>

        <rect x={180} y={120} width={90} height={32} {...NODE_STYLE} />
        <text
          x={225}
          y={141}
          textAnchor="middle"
          fontSize={11}
          fill={TEXT_PRIMARY}
        >
          MCPs
        </text>

        {/* Lines from Plugins to sub-nodes */}
        <line
          x1={130}
          y1={84}
          x2={95}
          y2={120}
          stroke={LINE_STROKE}
          strokeWidth={2}
        />
        <line
          x1={190}
          y1={84}
          x2={225}
          y2={120}
          stroke={LINE_STROKE}
          strokeWidth={2}
        />

        {/* Top-right: MCP Servers */}
        <rect x={560} y={40} width={160} height={44} {...NODE_STYLE} />
        <text
          x={640}
          y={67}
          textAnchor="middle"
          fontSize={13}
          fontWeight={600}
          fill={TEXT_PRIMARY}
        >
          MCP Servers
        </text>

        {/* Bottom-left: Hooks */}
        <rect x={80} y={bottomY} width={160} height={44} {...NODE_STYLE} />
        <text
          x={160}
          y={bottomY + 27}
          textAnchor="middle"
          fontSize={13}
          fontWeight={600}
          fill={TEXT_PRIMARY}
        >
          Hooks
        </text>

        {/* Bottom-right: Profiles */}
        <rect x={560} y={bottomY} width={160} height={44} {...NODE_STYLE} />
        <text
          x={640}
          y={bottomY + 27}
          textAnchor="middle"
          fontSize={13}
          fontWeight={600}
          fill={TEXT_PRIMARY}
        >
          Profiles
        </text>

        {/* Lines from main nodes to center */}
        {/* Plugins -> Center */}
        <line
          x1={240}
          y1={62}
          x2={290}
          y2={centerY + 15}
          stroke={LINE_STROKE}
          strokeWidth={2}
        />
        {/* MCP Servers -> Center */}
        <line
          x1={560}
          y1={62}
          x2={510}
          y2={centerY + 15}
          stroke={LINE_STROKE}
          strokeWidth={2}
        />
        {/* Hooks -> Center */}
        <line
          x1={240}
          y1={bottomY + 22}
          x2={290}
          y2={centerY + 35}
          stroke={LINE_STROKE}
          strokeWidth={2}
        />
        {/* Profiles -> Center */}
        <line
          x1={560}
          y1={bottomY + 22}
          x2={510}
          y2={centerY + 35}
          stroke={LINE_STROKE}
          strokeWidth={2}
        />

        {/* Dashed line: MCPs sub-node -> MCP Servers */}
        <line
          x1={270}
          y1={136}
          x2={560}
          y2={62}
          stroke={LINE_STROKE}
          strokeWidth={1.5}
          strokeDasharray="6 3"
        />

        {/* Dashed arc: Profiles -> Plugins ("controls which plugins are active") */}
        <path
          d={`M 560 ${bottomY + 22} Q 400 ${bottomY + 100} 240 ${isBeginner ? 62 : 62}`}
          fill="none"
          stroke={LINE_STROKE}
          strokeWidth={1.5}
          strokeDasharray="6 3"
        />
        <text
          x={400}
          y={bottomY + 70}
          textAnchor="middle"
          fontSize={10}
          fill={TEXT_MUTED}
          fontStyle="italic"
        >
          controls which plugins are active
        </text>

        {/* Beginner annotations */}
        {isBeginner ? <BeginnerAnnotations /> : null}
      </svg>
    </div>
  );
};
