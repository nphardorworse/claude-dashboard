type Level = "beginner" | "advanced";
type EcosystemDiagramProps = { level: Level };

/* ── Theme-adaptive colours via CSS custom properties ── */

const TEXT = "var(--color-zinc-100)";
const TEXT_DIM = "var(--color-zinc-400)";
const LINE = "var(--border-accent)";
const LINE_DIM = "var(--border-hairline)";
const FILL = "var(--surface-overlay)";
const FILL_CC = "var(--overlay-medium)";
const BG = "var(--surface-raised)";

/* Profiles accent – blue works on both dark and light backgrounds */
const BLUE = "rgba(59, 130, 246, 0.5)";
const BLUE_FILL = "rgba(59, 130, 246, 0.08)";

/* ── Layout ──
 *  Column 1: Claude Code  (x 15–140)
 *  Column 2: Profiles     (x 200–325)   accent, "dashboard feature"
 *  Column 3: Plugins      (x 385–500)
 *  Column 4: Skills / MCP Servers / Hooks  (x 565–670)
 *
 *  Solid arrows  = main flow (CC → Profiles → Plugins → outputs)
 *  Dashed blue   = Profiles configures outputs directly
 *  Dashed dim    = CC accesses everything at runtime
 */

export const EcosystemDiagram = ({ level }: EcosystemDiagramProps) => {
  const isBeginner = level === "beginner";

  return (
    <div className="rounded-xl bg-[var(--surface-raised)] p-5 ring-1 ring-[var(--border-hairline)] overflow-x-auto">
      <svg
        viewBox="0 0 700 300"
        role="img"
        aria-label="Horizontal ecosystem diagram: Claude Code flows through Profiles and Plugins to Skills, MCP Servers, and Hooks"
        style={{ minWidth: 520, maxWidth: "100%" }}
      >
        {/* Arrow markers */}
        <defs>
          <marker id="ea" viewBox="0 0 10 7" refX="9" refY="3.5"
            markerWidth="7" markerHeight="5" orient="auto">
            <path d="M0,0.5 L9,3.5 L0,6.5" fill={LINE} />
          </marker>
          <marker id="ead" viewBox="0 0 10 7" refX="9" refY="3.5"
            markerWidth="6" markerHeight="5" orient="auto">
            <path d="M0,0.5 L9,3.5 L0,6.5" fill={LINE_DIM} />
          </marker>
          <marker id="eab" viewBox="0 0 10 7" refX="9" refY="3.5"
            markerWidth="6" markerHeight="5" orient="auto">
            <path d="M0,0.5 L9,3.5 L0,6.5" fill={BLUE} />
          </marker>
        </defs>

        {/* ── Layer 1: Bypass arrows (behind nodes) ── */}

        {/* CC → Plugins (arcs above Profiles) */}
        <path d="M 140 133 C 205 88, 310 88, 385 133"
          fill="none" stroke={LINE_DIM} strokeWidth={1.2}
          strokeDasharray="4 3" markerEnd="url(#ead)" />

        {/* CC → Skills (wide arc above everything) */}
        <path d="M 140 126 C 140 12, 350 5, 563 44"
          fill="none" stroke={LINE_DIM} strokeWidth={1.2}
          strokeDasharray="4 3" markerEnd="url(#ead)" />

        {/* CC → Hooks (wide arc below everything) */}
        <path d="M 140 162 C 140 282, 350 290, 563 244"
          fill="none" stroke={LINE_DIM} strokeWidth={1.2}
          strokeDasharray="4 3" markerEnd="url(#ead)" />

        {/* Profiles → Skills (blue, arcs above Plugins) */}
        <path d="M 325 130 C 370 55, 490 35, 563 47"
          fill="none" stroke={BLUE} strokeWidth={1.2}
          strokeDasharray="4 3" markerEnd="url(#eab)" />

        {/* Profiles → Hooks (blue, arcs below Plugins) */}
        <path d="M 325 158 C 370 238, 490 260, 563 241"
          fill="none" stroke={BLUE} strokeWidth={1.2}
          strokeDasharray="4 3" markerEnd="url(#eab)" />

        {/* ── Layer 2: Main flow arrows (solid) ── */}

        {/* CC → Profiles */}
        <line x1={140} y1={144} x2={197} y2={144}
          stroke={LINE} strokeWidth={2} markerEnd="url(#ea)" />

        {/* Profiles → Plugins */}
        <line x1={325} y1={144} x2={382} y2={144}
          stroke={LINE} strokeWidth={2} markerEnd="url(#ea)" />

        {/* Plugins → Skills */}
        <line x1={500} y1={133} x2={563} y2={52}
          stroke={LINE} strokeWidth={2} markerEnd="url(#ea)" />

        {/* Plugins → MCP Servers */}
        <line x1={500} y1={144} x2={563} y2={144}
          stroke={LINE} strokeWidth={2} markerEnd="url(#ea)" />

        {/* Plugins → Hooks */}
        <line x1={500} y1={155} x2={563} y2={236}
          stroke={LINE} strokeWidth={2} markerEnd="url(#ea)" />

        {/* ── Layer 3: Nodes ── */}

        {/* Claude Code */}
        <rect x={15} y={120} width={125} height={48} rx={10}
          fill={FILL_CC} stroke={LINE} strokeWidth={1.5} />
        <text x={78} y={149} textAnchor="middle"
          fontSize={13} fontWeight={700} fill={TEXT}>
          Claude Code
        </text>

        {/* Profiles (blue accent) */}
        <rect x={200} y={120} width={125} height={48} rx={10}
          fill={BLUE_FILL} stroke={BLUE} strokeWidth={1.5} />
        <text x={263} y={148} textAnchor="middle"
          fontSize={13} fontWeight={600} fill={TEXT}>
          Profiles
        </text>
        <text x={263} y={184} textAnchor="middle"
          fontSize={9} fill={BLUE} fontStyle="italic">
          dashboard feature
        </text>

        {/* Plugins */}
        <rect x={385} y={120} width={115} height={48} rx={10}
          fill={FILL} stroke={LINE} strokeWidth={1.5} />
        <text x={443} y={149} textAnchor="middle"
          fontSize={13} fontWeight={600} fill={TEXT}>
          Plugins
        </text>

        {/* Skills */}
        <rect x={565} y={30} width={105} height={40} rx={8}
          fill={FILL} stroke={LINE} strokeWidth={1.5} />
        <text x={618} y={55} textAnchor="middle"
          fontSize={12} fontWeight={600} fill={TEXT}>
          Skills
        </text>

        {/* MCP Servers */}
        <rect x={565} y={124} width={105} height={40} rx={8}
          fill={FILL} stroke={LINE} strokeWidth={1.5} />
        <text x={618} y={149} textAnchor="middle"
          fontSize={12} fontWeight={600} fill={TEXT}>
          MCP Servers
        </text>

        {/* Hooks */}
        <rect x={565} y={218} width={105} height={40} rx={8}
          fill={FILL} stroke={LINE} strokeWidth={1.5} />
        <text x={618} y={243} textAnchor="middle"
          fontSize={12} fontWeight={600} fill={TEXT}>
          Hooks
        </text>

        {/* ── Layer 4: Beginner annotations & legend ── */}
        {isBeginner && (
          <g>
            {/* Arrow labels with background halo */}
            <text x={168} y={139} textAnchor="middle" fontSize={9}
              fill={TEXT_DIM} stroke={BG} strokeWidth={3}
              style={{ paintOrder: "stroke" }}>
              configures
            </text>
            <text x={353} y={139} textAnchor="middle" fontSize={9}
              fill={TEXT_DIM} stroke={BG} strokeWidth={3}
              style={{ paintOrder: "stroke" }}>
              activates
            </text>
            <text x={536} y={91} textAnchor="end" fontSize={9}
              fill={TEXT_DIM} stroke={BG} strokeWidth={3}
              style={{ paintOrder: "stroke" }}>
              provides
            </text>

            {/* Legend */}
            <g transform="translate(80, 286)" fontSize={9} fill={TEXT_DIM}>
              <line x1={0} y1={0} x2={25} y2={0}
                stroke={LINE} strokeWidth={2} />
              <text x={30} y={3.5}>main flow</text>

              <line x1={130} y1={0} x2={155} y2={0}
                stroke={BLUE} strokeWidth={1.2} strokeDasharray="4 3" />
              <text x={160} y={3.5}>profiles configure directly</text>

              <line x1={360} y1={0} x2={385} y2={0}
                stroke={LINE_DIM} strokeWidth={1.2} strokeDasharray="4 3" />
              <text x={390} y={3.5}>runtime access</text>
            </g>
          </g>
        )}
      </svg>
    </div>
  );
};
