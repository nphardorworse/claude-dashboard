import { useSyncExternalStore } from "react";
import { netState } from "../../lib/net";

// Shows only when /api requests have exhausted their retries — i.e. the dev
// server on :3847 is genuinely unreachable (killed, or a restart that's taking
// longer than usual). Gives a clear "it's the backend, not a frozen UI" signal
// instead of pages hanging on their spinners forever. It clears itself the
// moment a request succeeds again (net.ts flips the flag back).

export const ConnectionBanner = () => {
  const connected = useSyncExternalStore(
    netState.subscribe,
    netState.isConnected,
    () => true,
  );

  if (connected) return null;

  return (
    <div
      role="status"
      className="fixed inset-x-0 top-0 z-[150] flex items-center justify-center gap-2 bg-[#dc2626] px-4 py-1.5 text-center text-xs font-medium text-white shadow-md"
    >
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
      Can&rsquo;t reach the dashboard server on port 3847 &mdash; retrying&hellip;
    </div>
  );
};
