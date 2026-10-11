import { type Server, createServer } from "node:http";

/** How often the worker calls its own public URL (ADR-041). */
export const KEEP_AWAKE_MS = 10 * 60 * 1000;

/**
 * Answers `GET` and `HEAD /health` with 200 and nothing else. Render uses it
 * to see the service is up, and uptime monitors use it to keep it awake.
 */
export function startHealthServer(port: number): Promise<Server> {
  const server = createServer((request, response) => {
    const isHealth =
      request.url === "/health" &&
      (request.method === "GET" || request.method === "HEAD");
    response.writeHead(isHealth ? 200 : 404, { "content-type": "text/plain" });
    response.end(isHealth && request.method === "GET" ? "ok" : undefined);
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, () => resolve(server));
  });
}

/**
 * Render's free services sleep after 15 minutes without an inbound request,
 * and the Photon connection is outbound, so it does not count. Calling our
 * own public URL does. Returns a function that stops the timer.
 */
export function keepAwake(
  publicUrl: string,
  intervalMs: number = KEEP_AWAKE_MS,
  ping: typeof fetch = fetch,
): () => void {
  const timer = setInterval(() => {
    ping(new URL("/health", publicUrl), { method: "HEAD" }).catch(() => {
      console.error("health: keep-awake ping failed");
    });
  }, intervalMs);
  // The timer alone must not keep the process running.
  timer.unref();
  return () => clearInterval(timer);
}
