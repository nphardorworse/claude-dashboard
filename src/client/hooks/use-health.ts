import { useState, useEffect, useCallback, useRef } from "react";
import type { HealthResponse } from "../../shared/types";
import { buildScopedUrl } from "../lib/api";

const POLL_INTERVAL_MS = 5000;

export const useHealth = (projectPath?: string | null) => {
  const [data, setData] = useState<HealthResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let cancelled = false;

    const doFetch = async () => {
      try {
        const url = buildScopedUrl("/api/health", projectPath ?? null);
        const response = await fetch(url);
        if (cancelled) return;
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const json: HealthResponse = await response.json();
        if (cancelled) return;
        setData(json);
        setError(null);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    setIsLoading(true);
    doFetch();
    intervalRef.current = setInterval(doFetch, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [projectPath]);

  const refetch = useCallback(async () => {
    setIsLoading(true);
    try {
      const url = buildScopedUrl("/api/health", projectPath ?? null);
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const json: HealthResponse = await response.json();
      setData(json);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setIsLoading(false);
    }
  }, [projectPath]);

  return { data, isLoading, error, refetch };
};
