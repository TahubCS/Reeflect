// The agent worker (ADR-032): holds the Photon Spectrum connection and
// relays each text to the app. It has no business logic and never touches
// the database, Nessie, Plaid or Gemini.
import { Spectrum } from "spectrum-ts";
import { imessage } from "spectrum-ts/providers/imessage";
import { terminal } from "spectrum-ts/providers/terminal";
import { parseConfig } from "./config.ts";
import { keepAwake, startHealthServer } from "./health.ts";
import { type MessageSource, runWorker } from "./worker.ts";

const config = parseConfig(process.env);

async function connect(): Promise<MessageSource> {
  if (config.AGENT_PROVIDER === "imessage") {
    return Spectrum({
      // `parseConfig` has checked both are set for this provider.
      projectId: config.PHOTON_PROJECT_ID!,
      projectSecret: config.PHOTON_PROJECT_SECRET!,
      providers: [imessage.config()],
    });
  }
  return Spectrum({ providers: [terminal.config()] });
}

await startHealthServer(config.PORT);
if (config.RENDER_EXTERNAL_URL !== undefined) {
  keepAwake(config.RENDER_EXTERNAL_URL);
}

const source = await connect();
console.info("worker: connected", {
  provider: config.AGENT_PROVIDER,
  port: config.PORT,
});

// Spectrum stops the stream on SIGINT and SIGTERM, which ends this call.
await runWorker(source, {
  appUrl: config.REEFLECT_URL,
  serviceToken: config.AGENT_SERVICE_TOKEN,
});
