"use server";
import { refresh } from "next/cache";
import { DEFAULT_TIME_ZONE } from "@/config/app";
import { isoDateIn } from "@/features/accounts";
import { requireWorkspaceAccess } from "@/lib/auth/authz";
import { getSession } from "@/lib/auth/session";
import {
  writeSchema,
  type ReviewFormState,
  type WriteResult,
} from "../domain/review";
import { writeReview } from "./repository";

const messages: Record<WriteResult, string> = {
  ok: "Review saved.",
  already: "This review was already saved.",
  not_found: "This activity is unavailable. Reload and review again.",
  stale:
    "This activity changed since the form was opened. Reload and review again.",
  ineligible:
    "Choose two posted, equal and opposite amounts on different owned accounts within three days.",
  paired: "Remove the existing pairing before changing this activity.",
  allocated:
    "This label change would affect a linked bill payment. Unlink its evidence in Bills first, then review again.",
  limit:
    "This legacy group exceeds the review limit. Refine the review before making changes.",
};
export async function reviewTransferAction(
  workspaceId: unknown,
  _previous: ReviewFormState,
  form: FormData,
): Promise<ReviewFormState> {
  const access = await requireWorkspaceAccess(
    await getSession(),
    workspaceId,
    "editor",
  );
  const raw = form.get("review");
  if (typeof raw !== "string" || raw.length > 100000)
    return {
      message: "Choose a review action and confirm its effect.",
      ok: false,
    };
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return {
      message: "This review form is invalid. Reload and try again.",
      ok: false,
    };
  }
  const parsed = writeSchema.safeParse({
    ...(typeof value === "object" && value !== null ? value : {}),
    confirmed: form.get("confirm") === "on",
  });
  if (!parsed.success)
    return {
      message:
        "Choose a specific counterpart and confirm the effect before saving.",
      ok: false,
    };
  let result: WriteResult;
  try {
    result = await writeReview(
      access.workspaceId,
      parsed.data,
      isoDateIn(new Date(), DEFAULT_TIME_ZONE),
    );
  } catch {
    return {
      message:
        "The review could not be saved. Your selection is kept; try again.",
      ok: false,
    };
  }
  const ok = result === "ok" || result === "already";
  if (ok) refresh();
  return { message: messages[result], ok };
}
