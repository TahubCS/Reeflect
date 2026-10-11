/** How often the worker asks the app to run its jobs (ADR-041, ADR-105). */
export const TICK_MS = 5 * 60 * 1000;

export const TICK_TIMEOUT_MS = 60_000;

export type TickOptions = {
  /** The app's origin. */
  readonly appUrl: string;
  readonly serviceToken: string;
  readonly intervalMs?: number;
  readonly timeoutMs?: number;
  readonly fetch?: typeof fetch;
};

/**
 * The job clock (ADR-041): every five minutes, `POST /api/jobs/tick` on the
 * app with the service token. The app decides what to send and asks
 * `/send` for each text; the worker only keeps time. A tick still running
 * is not started again. Returns a function that stops the timer.
 */
export function startTicking(options: TickOptions): () => void {
  let running = false;
  const timer = setInterval(() => {
    if (running) return;
    running = true;
    void (options.fetch ?? fetch)(new URL("/api/jobs/tick", options.appUrl), {
      method: "POST",
      headers: { authorization: `Bearer ${options.serviceToken}` },
      signal: AbortSignal.timeout(options.timeoutMs ?? TICK_TIMEOUT_MS),
    })
      .then((response) => {
        // The status only: the body has counts, nothing worth logging.
        if (!response.ok) {
          console.error("tick: app answered", { status: response.status });
        }
      })
      .catch((error: unknown) => {
        console.error("tick: app not reached", {
          reason: error instanceof Error ? error.name : "unknown",
        });
      })
      .finally(() => {
        running = false;
      });
  }, options.intervalMs ?? TICK_MS);
  // The timer alone must not keep the process running.
  timer.unref();
  return () => clearInterval(timer);
}
