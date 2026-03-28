import { useState, useEffect, useCallback, useRef } from "react";
import { apiFetch } from "../lib/api";
import type { PlanLimits } from "../../shared/types";

const DEFAULT_LIMITS: PlanLimits = {
  sessionMessageLimit: null,
  weeklyMessageLimit: null,
  sessionResetsAt: null,
  weeklyResetsAt: null,
};

export const usePlanLimits = () => {
  const [limits, setLimits] = useState<PlanLimits>(DEFAULT_LIMITS);
  const [isLoading, setIsLoading] = useState(true);
  const limitsRef = useRef(limits);
  limitsRef.current = limits;

  useEffect(() => {
    const fetchLimits = async () => {
      try {
        const res = await fetch("/api/defaults/plan-limits");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json: PlanLimits = await res.json();
        setLimits(json);
      } catch {
        // Fall back to defaults
      } finally {
        setIsLoading(false);
      }
    };
    fetchLimits();
  }, []);

  const saveLimits = useCallback(async (next: PlanLimits) => {
    const previous = limitsRef.current;
    setLimits(next);
    try {
      const res = await apiFetch("/api/defaults/plan-limits", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch {
      setLimits(previous);
      throw new Error("Failed to save limits");
    }
  }, []);

  return { limits, saveLimits, isLoading };
};
