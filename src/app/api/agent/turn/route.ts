import {
  type TurnResponse,
  hasServiceToken,
  platformAllowed,
  runAgentTurn,
  turnRequestSchema,
} from "@/features/agent";

// One inbound message from the agent worker (ADR-032, ARCH-13). Only the
// worker may call this: anyone without the service token sees a 404, as if
// the route did not exist.
export async function POST(request: Request): Promise<Response> {
  if (!hasServiceToken(request.headers.get("authorization"))) {
    return new Response(null, { status: 404 });
  }

  const turn = turnRequestSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!turn.success || !platformAllowed(turn.data.platform)) {
    return Response.json({ error: "invalid turn" }, { status: 400 });
  }

  try {
    const body: TurnResponse = { reply: await runAgentTurn(turn.data) };
    return Response.json(body);
  } catch (error) {
    // Ids only: never the handle or the message text.
    console.error("agent turn failed", {
      messageId: turn.data.messageId,
      message: error instanceof Error ? error.message : "unknown",
    });
    return Response.json({ error: "turn failed" }, { status: 500 });
  }
}
