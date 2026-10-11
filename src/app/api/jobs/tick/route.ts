import { hasServiceToken } from "@/features/agent";
import { runAlertsTick } from "@/features/alerts";
import { env } from "@/lib/env";

// The job clock (ADR-041, ADR-105): the agent worker calls `POST` every
// five minutes with the service token, and Vercel Cron calls `GET` once a
// day with its secret as a backup. It takes no input: the phones and
// workspaces it works on come from verified, opted-in links only. Anyone
// else sees a 404, as if the route did not exist. Both read the request's
// headers, so neither is ever prerendered (Cache Components).

async function tick(): Promise<Response> {
  try {
    // Counts only: never a workspace, a phone or a text.
    return Response.json(await runAlertsTick());
  } catch (error) {
    console.error("jobs tick failed", {
      reason: error instanceof Error ? error.name : "unknown",
    });
    return Response.json({ error: "tick failed" }, { status: 500 });
  }
}

export async function POST(request: Request): Promise<Response> {
  if (!hasServiceToken(request.headers.get("authorization"))) {
    return new Response(null, { status: 404 });
  }
  return tick();
}

export async function GET(request: Request): Promise<Response> {
  // Checked first: `hasServiceToken` falls back to the worker's token when
  // given undefined, and the cron call must only ever use its own secret.
  const secret = env.CRON_SECRET;
  if (
    !secret ||
    !hasServiceToken(request.headers.get("authorization"), secret)
  ) {
    return new Response(null, { status: 404 });
  }
  return tick();
}
