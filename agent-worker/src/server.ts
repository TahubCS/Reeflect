import { createHash, timingSafeEqual } from "node:crypto";
import {
  type IncomingMessage,
  type Server,
  type ServerResponse,
  createServer,
} from "node:http";
import { type SendRequest, sendRequestSchema } from "@reeflect/agent-protocol";

/** How often the worker calls its own public URL (ADR-041). */
export const KEEP_AWAKE_MS = 10 * 60 * 1000;

/** A send request is a short text; anything longer is not one. */
const MAX_BODY_BYTES = 16 * 1024;

export type ServerOptions = {
  /** Shared with the app; without it `/send` answers 404 (ADR-032). */
  readonly serviceToken: string;
  /** Sends the text into the conversation. Throws when it cannot. */
  readonly send: (request: SendRequest) => Promise<void>;
};

const sha256 = (value: string): Buffer =>
  createHash("sha256").update(value).digest();

/** Both sides are hashed first, so the comparison takes the same time. */
function hasServiceToken(
  authorization: string | undefined,
  expected: string,
): boolean {
  if (!authorization?.startsWith("Bearer ")) return false;
  const presented = authorization.slice("Bearer ".length);
  return timingSafeEqual(sha256(presented), sha256(expected));
}

/** The request body as JSON, or null when it is too long or not JSON. */
async function readJson(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    size += (chunk as Buffer).length;
    // Keep reading, without keeping, so the answer can still be sent.
    if (size <= MAX_BODY_BYTES) chunks.push(chunk as Buffer);
  }
  if (size > MAX_BODY_BYTES) return null;
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return null;
  }
}

function end(response: ServerResponse, status: number, body?: string): void {
  response.writeHead(status, { "content-type": "text/plain" });
  response.end(body);
}

/**
 * `POST /send` (ADR-032): the app asks the worker to text a conversation.
 * Anyone without the service token sees a 404, as if it did not exist. The
 * worker sends exactly what it is given and decides nothing.
 */
async function handleSend(
  request: IncomingMessage,
  response: ServerResponse,
  options: ServerOptions,
): Promise<void> {
  if (!hasServiceToken(request.headers.authorization, options.serviceToken)) {
    return end(response, 404);
  }
  const body = sendRequestSchema.safeParse(await readJson(request));
  if (!body.success) return end(response, 400, "invalid send");

  try {
    await options.send(body.data);
    end(response, 200, "sent");
  } catch (error) {
    // The reason only: never the conversation or the text.
    console.error("server: send failed", {
      reason: error instanceof Error ? error.name : "unknown",
    });
    end(response, 502, "not sent");
  }
}

/**
 * The worker's small HTTP server. `GET` and `HEAD /health` answer 200:
 * Render uses it to see the service is up, and uptime monitors use it to
 * keep it awake. `POST /send` is for the app. Everything else is 404.
 */
export function startServer(
  port: number,
  options: ServerOptions,
): Promise<Server> {
  const server = createServer((request, response) => {
    if (request.url === "/send" && request.method === "POST") {
      void handleSend(request, response, options);
      return;
    }
    const isHealth =
      request.url === "/health" &&
      (request.method === "GET" || request.method === "HEAD");
    end(
      response,
      isHealth ? 200 : 404,
      isHealth && request.method === "GET" ? "ok" : undefined,
    );
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
