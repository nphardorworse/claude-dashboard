import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "~/client/components/ui/tooltip";

type HeaderTooltipProps = {
  label: string;
  tooltip: string;
  className?: string;
};

export const HeaderTooltip = ({ label, tooltip, className }: HeaderTooltipProps) => (
  <TooltipProvider>
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={`inline-flex cursor-help items-center gap-1 ${className ?? ""}`}>
          {label}
          <svg
            viewBox="0 0 16 16"
            fill="currentColor"
            className="h-2.5 w-2.5 text-zinc-600"
          >
            <path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1Zm-.75 3.5a.75.75 0 1 1 1.5 0 .75.75 0 0 1-1.5 0ZM8 6.5a.5.5 0 0 1 .5.5v4a.5.5 0 0 1-1 0V7a.5.5 0 0 1 .5-.5Z" />
          </svg>
        </span>
      </TooltipTrigger>
      <TooltipContent
        side="top"
        sideOffset={4}
        className="max-w-[220px] bg-zinc-900 px-2.5 py-1.5 text-[10px] leading-relaxed text-zinc-300 shadow-xl ring-1 ring-[var(--border-hairline)]"
      >
        {tooltip}
      </TooltipContent>
    </Tooltip>
  </TooltipProvider>
);
