import { APP_NAME } from "@/config/app";

// Fixed replies written by code (ADR-040). None carries financial data, so
// each is safe to send to a phone that is not linked (ADR-034).

export const REPLIES = {
  signUp: `Hi, it's ${APP_NAME}. To use me here, sign in on the website, open Settings and choose Connect iMessage.`,
  linkPending: `Almost there. Open ${APP_NAME} settings and press Approve to finish linking.`,
  linkFailed: `That code didn't work. Get a new one in ${APP_NAME} settings.`,
  linkLocked: `Too many tries. Wait a few minutes, then get a new code in ${APP_NAME} settings.`,
  alreadyLinked: "This phone is already linked. Text STOP to unlink it first.",
  stopped: `Done. This phone is unlinked and ${APP_NAME} won't text it. You can link again from Settings.`,
  notLinked: "This phone isn't linked, so there is nothing to stop.",
} as const;
