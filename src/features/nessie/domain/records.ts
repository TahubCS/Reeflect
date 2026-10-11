// Nessie's records as its API returns them (ADR-033, ADR-048). Unknown
// fields are allowed: we validate only what we read.
import { z } from "zod";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const NESSIE_ACCOUNT_TYPES = [
  "Checking",
  "Savings",
  "Credit Card",
] as const;

export const nessieAccountSchema = z.object({
  _id: z.string().min(1),
  type: z.enum(NESSIE_ACCOUNT_TYPES),
  nickname: z.string(),
  balance: z.number(),
  customer_id: z.string().optional(),
});
export type NessieAccount = z.infer<typeof nessieAccountSchema>;

/** Nessie's statuses; "cancelled" records are dropped by the mapper. */
const status = z.string();

export const nessiePurchaseSchema = z.object({
  _id: z.string().min(1),
  merchant_id: z.string().optional(),
  purchase_date: isoDate,
  amount: z.number(),
  status,
  description: z.string().optional(),
});
export type NessiePurchase = z.infer<typeof nessiePurchaseSchema>;

/** Deposits and withdrawals share one shape. */
export const nessieMovementSchema = z.object({
  _id: z.string().min(1),
  transaction_date: isoDate,
  amount: z.number(),
  status,
  description: z.string().optional(),
});
export type NessieMovement = z.infer<typeof nessieMovementSchema>;

export const nessieCreatedSchema = z.object({
  objectCreated: z.object({ _id: z.string().min(1) }),
});

export type AccountRecords = {
  account: NessieAccount;
  purchases: NessiePurchase[];
  deposits: NessieMovement[];
  withdrawals: NessieMovement[];
};
