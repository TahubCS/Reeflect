// Runs once when the server starts. Importing env validates every environment
// variable, so the app refuses to start when one is missing (ARCH-09).
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("@/lib/env");
  }
}
