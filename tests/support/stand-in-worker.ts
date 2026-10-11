// Stands in for the agent worker in Playwright runs (playwright.config.ts).
// It accepts what the app posts to `/send`, as the real worker does, and
// keeps it so a spec can ask what a conversation was sent. It texts no one.
import { createServer } from "node:http";

const port = Number(process.env.STAND_IN_WORKER_PORT);
const token = process.env.AGENT_SERVICE_TOKEN;

/** Texts received, by conversation id. */
const sent = new Map<string, string[]>();

createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", "http://localhost");
  const answer = (status: number, body: unknown = null) => {
    response.writeHead(status, { "content-type": "application/json" });
    response.end(JSON.stringify(body));
  };

  if (url.pathname === "/health") return answer(200, "ok");
  if (request.headers.authorization !== `Bearer ${token}`) return answer(404);

  if (url.pathname === "/send" && request.method === "POST") {
    let raw = "";
    for await (const chunk of request) raw += String(chunk);
    const { spaceId, text } = JSON.parse(raw) as {
      spaceId: string;
      text: string;
    };
    sent.set(spaceId, [...(sent.get(spaceId) ?? []), text]);
    return answer(200, "sent");
  }

  if (url.pathname === "/sent" && request.method === "GET") {
    return answer(200, sent.get(url.searchParams.get("spaceId") ?? "") ?? []);
  }
  answer(404);
}).listen(port);
