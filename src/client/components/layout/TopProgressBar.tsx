import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { netState } from "../../lib/net";

// A thin top-of-viewport progress bar (NProgress-style) that reflects in-flight
// /api requests tracked by net.ts. It deliberately waits a beat before showing
// so the frequent fast background polls (health 5s, usage 30s) don't flash it —
// the bar only appears for loads that actually take a moment (initial load,
// navigation, a slow endpoint, or while retrying an unreachable server).

const APPEAR_DELAY_MS = 200;
const TRICKLE_MS = 400;
const DONE_FADE_MS = 350;

export const TopProgressBar = () => {
  const inflight = useSyncExternalStore(
    netState.subscribe,
    netState.getInflight,
    () => 0,
  );
  const loading = inflight > 0;

  const [progress, setProgress] = useState(0);
  const [visible, setVisible] = useState(false);
  const visibleRef = useRef(false);
  const timers = useRef<{ appear?: number; trickle?: number; done?: number }>({});

  useEffect(() => {
    visibleRef.current = visible;
  }, [visible]);

  useEffect(() => {
    const t = timers.current;
    const stopTrickle = () => {
      if (t.trickle) {
        clearInterval(t.trickle);
        t.trickle = undefined;
      }
    };

    if (loading) {
      if (t.done) {
        clearTimeout(t.done);
        t.done = undefined;
      }
      if (!t.trickle && !t.appear) {
        t.appear = window.setTimeout(() => {
          t.appear = undefined;
          setVisible(true);
          setProgress((p) => (p < 10 ? 10 : p));
          // Ease toward 90% but never reach it until the load actually finishes.
          t.trickle = window.setInterval(() => {
            setProgress((p) => (p < 90 ? p + (90 - p) * 0.12 : p));
          }, TRICKLE_MS);
        }, APPEAR_DELAY_MS);
      }
    } else {
      if (t.appear) {
        clearTimeout(t.appear);
        t.appear = undefined;
      }
      stopTrickle();
      if (visibleRef.current) {
        setProgress(100);
        t.done = window.setTimeout(() => {
          t.done = undefined;
          setVisible(false);
          setProgress(0);
        }, DONE_FADE_MS);
      }
    }
  }, [loading]);

  useEffect(
    () => () => {
      const t = timers.current;
      if (t.appear) clearTimeout(t.appear);
      if (t.trickle) clearInterval(t.trickle);
      if (t.done) clearTimeout(t.done);
    },
    [],
  );

  if (!visible) return null;

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-x-0 top-0 z-[200] h-[3px]"
    >
      <div
        className="h-full rounded-r-full bg-[var(--color-blue-500)] transition-[width,opacity] duration-300 ease-out"
        style={{
          width: `${progress}%`,
          opacity: progress >= 100 ? 0 : 1,
          boxShadow:
            "0 0 8px var(--color-blue-500), 0 0 3px var(--color-blue-500)",
        }}
      />
    </div>
  );
};
