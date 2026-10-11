import "server-only";
import { notFound } from "next/navigation";
import { DEFAULT_TIME_ZONE } from "@/config/app";
import { isoDateIn } from "@/features/accounts";
import { requireWorkspaceAccess } from "@/lib/auth/authz";
import { getSession } from "@/lib/auth/session";
import { roleAtLeast } from "@/lib/auth/roles";
import { reviewQuery, type ReviewData } from "../domain/review";
import { readReview } from "./repository";

export async function loadTransferReview(
  workspaceId: unknown,
  rawQuery: unknown = {},
  now?: Date,
): Promise<ReviewData> {
  const access = await requireWorkspaceAccess(
    await getSession(),
    workspaceId,
    "viewer",
  );
  const today = isoDateIn(now ?? new Date(), DEFAULT_TIME_ZONE);
  const query = reviewQuery(rawQuery, today);
  if (!query) notFound();
  const data = await readReview(access.workspaceId, query, today);
  if (
    [query.account, query.other].some(
      (id) => id && !data.accounts.some((a) => a.id === id),
    )
  )
    notFound();
  if (query.source && !data.rows.length) notFound();
  return {
    ...data,
    workspaceId: access.workspaceId,
    today,
    query,
    canEdit: roleAtLeast(access.role, "editor"),
  };
}
