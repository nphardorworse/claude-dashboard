// Global network instrumentation.
//
// Wraps the global `fetch` (installed once from main.tsx) for same-origin
// /api requests only. It does two things every data hook gets for free:
//
//   1. Tracks in-flight /api requests so the top progress bar can show during
//      loads — without threading state through ~15 fetch call sites.
//   2. Makes the client resilient to the dev API server being briefly
//      unreachable. `tsx watch` restarts the server on every change and
//      `concurrently` boots client + server together, so a request can land
//      in the ~250ms window where :3847 isn't listening (ECONNREFUSED, or a
//      503 from the Vite proxy fallback). Those requests are retried with a
//      short backoff instead of surfacing as a failed load.
//
// Non-/api requests (fonts, static assets) pass straight through untouched.

type Listener = () => void;

let inflight = 0;
let connected = true;
const listeners = new Set<Listener>();

const emit = (): void => {
  for (const listener of listeners) listener();
};

export const netState = {
  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  getInflight: (): number => inflight,
  isConnected: (): boolean => connected,
};

const setConnected = (value: boolean): void => {
  if (connected !== value) {
    connected = value;
    emit();
  }
};

// Backoff schedule for unreachable-server retries. Total ~2.5s of patience,
// which comfortably covers a `tsx watch` restart and the startup race.
const RETRY_DELAYS_MS = [300, 600, 900, 1500];

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

const pathOf = (input: RequestInfo | URL): string => {
  try {
    if (typeof input === "string") return new URL(input, location.origin).pathname;
    if (input instanceof URL) return input.pathname;
    if (input instanceof Request) return new URL(input.url, location.origin).pathname;
  } catch {
    // malformed URL — treat as non-api, pass through
  }
  return "";
};

const isApiRequest = (input: RequestInfo | URL): boolean =>
  pathOf(input).startsWith("/api");

const isAbort = (err: unknown, init?: RequestInit): boolean =>
  (err instanceof DOMException && err.name === "AbortError") ||
  init?.signal?.aborted === true;

/**
 * Install the fetch wrapper. Idempotent — safe under React StrictMode's
 * double-invoked module effects.
 */
export const installNetInstrumentation = (): void => {
  const w = window as Window & { __netInstrumented?: boolean };
  if (w.__netInstrumented) return;
  w.__netInstrumented = true;

  const originalFetch = window.fetch.bind(window);

  window.fetch = async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    if (!isApiRequest(input)) return originalFetch(input, init);

    inflight += 1;
    emit();

    // A 503 from the Vite proxy, or a thrown connect error, both mean the
    // request never reached the app — safe to retry regardless of method.
    try {
      for (let attempt = 0; ; attempt += 1) {
        try {
          const res = await originalFetch(input, init);
          if (res.status === 503 && attempt < RETRY_DELAYS_MS.length) {
            await sleep(RETRY_DELAYS_MS[attempt]);
            continue;
          }
          setConnected(res.status !== 503);
          return res;
        } catch (err) {
          if (isAbort(err, init)) throw err;
          if (attempt < RETRY_DELAYS_MS.length) {
            await sleep(RETRY_DELAYS_MS[attempt]);
            continue;
          }
          setConnected(false);
          throw err;
        }
      }
    } finally {
      inflight = Math.max(0, inflight - 1);
      emit();
    }
  };
};
