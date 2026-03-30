type Step = { title: string; detail: string };

const BEGINNER_STEPS: Step[] = [
  {
    title: "Install the dashboard",
    detail:
      "Clone the repo, npm install, npm run dev. Open localhost:5175.",
  },
  {
    title: "Check the Overview",
    detail:
      "See how many plugins are loaded and estimated cost per turn.",
  },
  {
    title: "Pick a Profile",
    detail:
      "Go to Profiles tab. Save your current setup as a profile, or create custom presets for different workflows.",
  },
  {
    title: "Review MCP Servers",
    detail:
      "Go to MCP tab. Check health status. Disable any you don't use.",
  },
  {
    title: "Open a Project",
    detail:
      "Use the project selector in the sidebar. See project-specific overrides.",
  },
  {
    title: "Customize",
    detail:
      "Enable/disable plugins and MCPs for this specific project. Your changes are saved to the project's config files.",
  },
];

const ADVANCED_STEPS: Step[] = [
  { title: "Install", detail: "npm install && npm run dev \u2192 localhost:5175" },
  { title: "Overview", detail: "Check tokens/turn health card" },
  { title: "Profiles", detail: "Switch to appropriate preset" },
  { title: "MCP", detail: "Verify health, disable unused, pin essentials" },
  {
    title: "Project",
    detail: "Select project \u2192 customize plugin/MCP overrides",
  },
  { title: "Usage", detail: "Optional: set usage tracking limits" },
];

const StepItem = ({ step, index }: { step: Step; index: number }) => (
  <div className="flex items-start gap-3">
    <div className="w-7 h-7 rounded-full bg-blue-500/20 text-blue-400 text-[12px] font-bold flex items-center justify-center shrink-0">
      {index + 1}
    </div>
    <div>
      <p className="text-[13px] font-semibold text-zinc-100">{step.title}</p>
      <p className="text-[12px] text-zinc-400">{step.detail}</p>
    </div>
  </div>
);

const StepList = ({ steps }: { steps: Step[] }) => {
  const items = steps.map((step, i) => (
    <StepItem key={step.title} step={step} index={i} />
  ));

  return <div className="space-y-4">{items}</div>;
};

type QuickStartStepsProps = {
  level: "beginner" | "advanced";
};

export const QuickStartSteps = ({ level }: QuickStartStepsProps) => {
  const steps = level === "beginner" ? BEGINNER_STEPS : ADVANCED_STEPS;
  return <StepList steps={steps} />;
};
