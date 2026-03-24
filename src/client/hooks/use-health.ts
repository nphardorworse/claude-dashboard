import { useState, useEffect, useCallback, useRef } from "react";
import type { HealthResponse } from "../../shared/types";
import { buildScopedUrl } from "../lib/api";

const POLL_INTERVAL_MS = 5000;

export const useHealth = (projectPath?: string | null) => {
  const [data, setData] = useState<HealthResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchHealth = useCallback(async () => {
    try {
      const url = buildScopedUrl("/api/health", projectPath ?? null);
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const json: HealthResponse = await response.json();
      setData(json);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setIsLoading(false);
    }
  }, [projectPath]);

  useEffect(() => {
    setIsLoading(true);
    fetchHealth();
    intervalRef.current = setInterval(fetchHealth, POLL_INTERVAL_MS);
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [fetchHealth]);

  return { data, isLoading, error, refetch: fetchHealth };
};
