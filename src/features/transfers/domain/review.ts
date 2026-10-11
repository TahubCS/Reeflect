import { z } from "zod";
import { cents, negate } from "@/lib/money";

export const PAGE_SIZE = 20;
export const MATCH_CAP = 2000;
export const PAIR_CAP = 50;
export const dateSchema = z.iso.date();
const optionalId = z.preprocess(
  (v) => (v === "" ? undefined : v),
  z.uuid().optional(),
);
export const querySchema = z.object({
  from: dateSchema.optional(),
  to: dateSchema.optional(),
  account: optionalId,
  other: optionalId,
  source: optionalId,
  view: z.enum(["review", "pairs", "individual", "all"]).default("review"),
  page: z.coerce.number().int().min(1).max(1000).default(1),
  matchPage: z.coerce.number().int().min(1).max(100).default(1),
});
export type ReviewQuery = z.infer<typeof querySchema> & {
  from: string;
  to: string;
};
export function shiftDay(day: string, days: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
export function calendarGap(a: string, b: string): number {
  return (
    Math.abs(
      new Date(`${a}T00:00:00Z`).getTime() -
        new Date(`${b}T00:00:00Z`).getTime(),
    ) / 86400000
  );
}
export function reviewQuery(raw: unknown, today: string): ReviewQuery | null {
  const parsed = querySchema.safeParse(raw);
  if (!parsed.success) return null;
  const to = parsed.data.to ?? today;
  const from = parsed.data.from ?? shiftDay(to, -89);
  if (
    from < "2000-01-01" ||
    to > today ||
    from > to ||
    calendarGap(from, to) > 365
  )
    return null;
  return { ...parsed.data, from, to };
}

// Expected state also supports malformed legacy rows. Safe cents are checked
// explicitly before matching; metadata-only detachment does no money math.
export const stateSchema = z.object({
  id: z.uuid(),
  accountId: z.uuid(),
  postedOn: dateSchema,
  amountCents: z.number().refine(Number.isInteger),
  status: z.enum(["posted", "pending"]),
  description: z.string().max(10000),
  isTransfer: z.boolean(),
  pairId: z.string().max(500).nullable(),
  updatedAt: z.iso.datetime(),
});
export type RowState = z.infer<typeof stateSchema>;
export type ReviewRow = RowState & {
  workspaceId: string;
  accountName: string;
  accountType: string | null;
  ownedAccount: boolean;
};
export const writeSchema = z.discriminatedUnion("operation", [
  z.object({
    operation: z.literal("pair"),
    expected: z.array(stateSchema).length(2),
    confirmed: z.literal(true),
  }),
  z.object({
    operation: z.literal("detach"),
    expected: z.array(stateSchema).min(1).max(PAIR_CAP),
    confirmed: z.literal(true),
  }),
  z.object({
    operation: z.literal("label"),
    expected: z.array(stateSchema).length(1),
    transfer: z.boolean(),
    confirmed: z.literal(true),
  }),
]);
export type ReviewWrite = z.infer<typeof writeSchema>;
export type WriteResult =
  | "ok"
  | "already"
  | "not_found"
  | "stale"
  | "ineligible"
  | "paired"
  | "allocated"
  | "limit";
export type ReviewFormState = { message?: string; ok?: boolean };

export function eligible(
  a: ReviewRow,
  b: ReviewRow,
  today: string,
  allowPaired = false,
): boolean {
  return (
    a.id !== b.id &&
    a.workspaceId === b.workspaceId &&
    a.ownedAccount &&
    b.ownedAccount &&
    a.accountId !== b.accountId &&
    a.status === "posted" &&
    b.status === "posted" &&
    Number.isSafeInteger(a.amountCents) &&
    Number.isSafeInteger(b.amountCents) &&
    a.amountCents !== 0 &&
    negate(cents(a.amountCents)) === b.amountCents &&
    dateSchema.safeParse(a.postedOn).success &&
    dateSchema.safeParse(b.postedOn).success &&
    a.postedOn <= today &&
    b.postedOn <= today &&
    calendarGap(a.postedOn, b.postedOn) <= 3 &&
    (allowPaired || (a.pairId === null && b.pairId === null))
  );
}
export function matchesFacts(a: RowState, b: RowState): boolean {
  return (
    a.id === b.id &&
    a.accountId === b.accountId &&
    a.postedOn === b.postedOn &&
    a.amountCents === b.amountCents &&
    a.status === b.status &&
    a.description === b.description
  );
}
export function matchesState(a: RowState, b: RowState): boolean {
  return (
    matchesFacts(a, b) &&
    a.isTransfer === b.isTransfer &&
    a.pairId === b.pairId &&
    a.updatedAt === b.updatedAt
  );
}
export function pairStatus(
  members: readonly ReviewRow[],
  today: string,
): "confirmed" | "incomplete" | "invalid" {
  if (members.length === 1) return "incomplete";
  if (members.length !== 2) return "invalid";
  const [a, b] = members as [ReviewRow, ReviewRow];
  return Boolean(a.pairId) &&
    a.pairId === b.pairId &&
    a.isTransfer &&
    b.isTransfer &&
    eligible(a, b, today, true)
    ? "confirmed"
    : "invalid";
}
export type RowReview = {
  row: ReviewRow;
  members: ReviewRow[];
  pairStatus: ReturnType<typeof pairStatus> | null;
  candidates: ReviewRow[];
  candidateCount: number;
  matchesLimited: boolean;
  groupLimited: boolean;
};
export type ReviewData = {
  workspaceId: string;
  today: string;
  query: ReviewQuery;
  canEdit: boolean;
  accounts: { id: string; name: string }[];
  rows: RowReview[];
  hasMore: boolean;
};
