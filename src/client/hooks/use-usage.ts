import { useState, useEffect, useCallback, useRef } from "react";
import type { UsageResponse } from "../../shared/types";

const POLL_INTERVAL_MS = 30_000;

export const useUsage = () => {
  const [data, setData] = useState<UsageResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchUsage = useCallback(async () => {
    try {
      const res = await fetch("/api/usage");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: UsageResponse = await res.json();
      setData(json);
    } catch {
      // Silent fail — sidebar still works without usage data
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsage();
    intervalRef.current = setInterval(fetchUsage, POLL_INTERVAL_MS);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchUsage]);

  return { data, isLoading };
};
