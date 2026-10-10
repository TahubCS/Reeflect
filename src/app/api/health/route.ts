import { connection } from "next/server";
import { checkDatabase } from "@/lib/db/health";

// Liveness check for uptime monitors and for confirming the Neon connection
// after a deploy. Returns no data and no error details.
export async function GET(): Promise<Response> {
  // Run at request time, never during the build.
  await connection();

  const health = await checkDatabase();
  if (!health.ok) {
    console.error("health: database check failed", { reason: health.reason });
    return Response.json({ status: "unavailable" }, { status: 503 });
  }
  return Response.json({ status: "ok", databaseLatencyMs: health.latencyMs });
}
