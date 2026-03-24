import { useState, useCallback } from "react";
import { useToast } from "../shared/Toast";

type ApplyDefaultsButtonProps = {
  projectPath: string;
  onApplied: () => void;
};

export const ApplyDefaultsButton = ({ projectPath, onApplied }: ApplyDefaultsButtonProps) => {
  const [isApplying, setIsApplying] = useState(false);
  const { toast } = useToast();

  const handleApply = useCallback(async () => {
    setIsApplying(true);
    try {
      const res = await fetch("/api/defaults/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectPath }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      toast(`Applied defaults: ${data.applied.disabledMcpServers} MCPs disabled`, "success");
      onApplied();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to apply", "error");
    } finally {
      setIsApplying(false);
    }
  }, [projectPath, onApplied, toast]);

  return (
    <button
      onClick={handleApply}
      disabled={isApplying}
      className="rounded-full bg-zinc-800 px-4 py-1.5 text-[11px] font-medium text-zinc-300 ring-1 ring-[var(--border-hairline)] transition-snappy hover:bg-zinc-700 active:scale-95 disabled:opacity-50"
    >
      {isApplying ? "Applying..." : "Apply MCP Defaults"}
    </button>
  );
};
