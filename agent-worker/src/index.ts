// The agent worker (ADR-032): holds the Photon Spectrum connection, relays
// each text to the app, and sends what the app asks it to. It has no
// business logic and never touches the database, Nessie, Plaid or Gemini.
import type { SendRequest } from "@reeflect/agent-protocol";
import { Spectrum } from "spectrum-ts";
import { imessage } from "spectrum-ts/providers/imessage";
import { terminal } from "spectrum-ts/providers/terminal";
import { parseConfig } from "./config.ts";
import { keepAwake, startServer } from "./server.ts";
import { type MessageSource, runWorker } from "./worker.ts";

const config = parseConfig(process.env);

type Connection = {
  readonly source: MessageSource;
  /** The conversation with this id, to send into. */
  readonly space: (
    spaceId: string,
  ) => Promise<{ send(text: string): Promise<unknown> }>;
};

async function connect(): Promise<Connection> {
  if (config.AGENT_PROVIDER === "imessage") {
    const app = await Spectrum({
      // `parseConfig` has checked both are set for this provider.
      projectId: config.PHOTON_PROJECT_ID!,
      projectSecret: config.PHOTON_PROJECT_SECRET!,
      providers: [imessage.config()],
    });
    return { source: app, space: (id) => imessage(app).space.get(id) };
  }
  const app = await Spectrum({ providers: [terminal.config()] });
  return { source: app, space: (id) => terminal(app).space.get(id) };
}

// The server starts first so Render sees the port; until Spectrum is
// connected, a send fails and the app is told so.
const live: { connection?: Connection } = {};

/** `POST /send`: only for the platform this worker is connected to. */
async function send(request: SendRequest): Promise<void> {
  const { connection } = live;
  if (connection === undefined) throw new Error("send: not connected yet");
  if (request.platform !== config.AGENT_PROVIDER) {
    throw new Error("send: not this worker's platform");
  }
  const space = await connection.space(request.spaceId);
  await space.send(request.text);
}

await startServer(config.PORT, {
  serviceToken: config.AGENT_SERVICE_TOKEN,
  send,
});
if (config.RENDER_EXTERNAL_URL !== undefined) {
  keepAwake(config.RENDER_EXTERNAL_URL);
}

live.connection = await connect();
const { source } = live.connection;
console.info("worker: connected", {
  provider: config.AGENT_PROVIDER,
  port: config.PORT,
});

// Spectrum stops the stream on SIGINT and SIGTERM, which ends `runWorker`.
let stopping = false;
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    stopping = true;
  });
}

await runWorker(source, {
  appUrl: config.REEFLECT_URL,
  serviceToken: config.AGENT_SERVICE_TOKEN,
});

// The HTTP server would keep this process alive and `/health` answering
// while no text is heard any more. If the stream ended without a signal,
// leave with an error so the host starts a fresh worker.
if (!stopping) console.error("worker: message stream ended by itself");
process.exit(stopping ? 0 : 1);
