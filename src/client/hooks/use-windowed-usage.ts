import { useState, useEffect, useCallback, useRef } from "react";
import type { WindowedUsageResponse } from "../../shared/types";

const POLL_INTERVAL_MS = 30_000;

export const useWindowedUsage = () => {
  const [data, setData] = useState<WindowedUsageResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchWindowed = useCallback(async () => {
    try {
      const res = await fetch("/api/usage/windowed");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: WindowedUsageResponse = await res.json();
      setData(json);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load usage data");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchWindowed();
    intervalRef.current = setInterval(fetchWindowed, POLL_INTERVAL_MS);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchWindowed]);

  return { data, isLoading, error, refetch: fetchWindowed };
};
