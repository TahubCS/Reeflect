// The Nessie HTTP client (ADR-033, ADR-048). Used by the sync on the server
// and by `scripts/nessie`; never imported by UI code. The key travels in the
// query string, so no URL or raw error from here may reach a log: errors
// carry the method, the path and the status only.
import { z } from "zod";
import {
  type AccountRecords,
  type NessieAccount,
  nessieAccountSchema,
  nessieBillSchema,
  nessieCreatedSchema,
  nessieMovementSchema,
  nessiePurchaseSchema,
} from "./domain/records";

export const NESSIE_BASE_URL = "https://api.nessieisreal.com";

export class NessieError extends Error {
  readonly method: string;
  /** The path without the query string, so never the key. */
  readonly path: string;
  readonly status: number | null;

  constructor(
    method: string,
    path: string,
    status: number | null,
    detail?: string,
  ) {
    super(
      `Nessie ${method} ${path} failed${status === null ? "" : ` (${status})`}${detail ? `: ${detail}` : ""}`,
    );
    this.name = "NessieError";
    this.method = method;
    this.path = path;
    this.status = status;
  }
}

export type NessieClientOptions = {
  key: string;
  fetch?: typeof fetch;
  baseUrl?: string;
  timeoutMs?: number;
};

type Method = "GET" | "POST" | "PUT" | "DELETE";

export function nessieClient(options: NessieClientOptions) {
  const doFetch = options.fetch ?? fetch;
  const base = options.baseUrl ?? NESSIE_BASE_URL;
  const timeoutMs = options.timeoutMs ?? 15_000;
  if (!options.key) throw new Error("NESSIE_API_KEY is not set");

  /** Status and parsed body; 5xx and 429 are retried twice with backoff. */
  async function call(
    method: Method,
    path: string,
    body?: unknown,
  ): Promise<{ status: number; json: unknown }> {
    const url = `${base}${path}?key=${encodeURIComponent(options.key)}`;
    for (let attempt = 0; ; attempt++) {
      let response: Response;
      try {
        response = await doFetch(url, {
          method,
          headers: body ? { "Content-Type": "application/json" } : undefined,
          body: body ? JSON.stringify(body) : undefined,
          signal: AbortSignal.timeout(timeoutMs),
          cache: "no-store",
        });
      } catch {
        // The original error can include the URL: drop it.
        if (attempt < 2) {
          await wait(attempt);
          continue;
        }
        throw new NessieError(method, path, null, "network error or timeout");
      }
      if ((response.status >= 500 || response.status === 429) && attempt < 2) {
        await wait(attempt);
        continue;
      }
      const text = await response.text();
      let json: unknown = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        json = text;
      }
      return { status: response.status, json };
    }
  }

  async function expectOk(method: Method, path: string, body?: unknown) {
    const { status, json } = await call(method, path, body);
    if (status < 200 || status >= 300)
      throw new NessieError(method, path, status, shortDetail(json));
    return json;
  }

  /** A list; Nessie answers 404 for some empty lists (transfers). */
  async function list<T>(path: string, schema: z.ZodType<T>): Promise<T[]> {
    const { status, json } = await call("GET", path);
    if (status === 404) return [];
    if (status !== 200)
      throw new NessieError("GET", path, status, shortDetail(json));
    const parsed = z.array(schema).safeParse(json);
    if (!parsed.success)
      throw new NessieError("GET", path, status, "unexpected response shape");
    return parsed.data;
  }

  async function create(path: string, body: unknown): Promise<string> {
    const json = await expectOk("POST", path, body);
    const parsed = nessieCreatedSchema.safeParse(json);
    if (!parsed.success)
      throw new NessieError("POST", path, null, "no id in the response");
    return parsed.data.objectCreated._id;
  }

  return {
    /** The account, or null when Nessie no longer has it. */
    async getAccount(id: string): Promise<NessieAccount | null> {
      const path = `/accounts/${encodeURIComponent(id)}`;
      const { status, json } = await call("GET", path);
      if (status === 404) return null;
      if (status !== 200)
        throw new NessieError("GET", path, status, shortDetail(json));
      const parsed = nessieAccountSchema.safeParse(json);
      if (!parsed.success)
        throw new NessieError("GET", path, status, "unexpected response shape");
      return parsed.data;
    },

    customerAccounts: (customerId: string) =>
      list(
        `/customers/${encodeURIComponent(customerId)}/accounts`,
        nessieAccountSchema,
      ),

    /** Everything a sync reads for one account: 4 requests, in parallel. */
    async accountRecords(account: NessieAccount): Promise<AccountRecords> {
      const at = `/accounts/${encodeURIComponent(account._id)}`;
      const [purchases, deposits, withdrawals, bills] = await Promise.all([
        list(`${at}/purchases`, nessiePurchaseSchema),
        list(`${at}/deposits`, nessieMovementSchema),
        list(`${at}/withdrawals`, nessieMovementSchema),
        list(`${at}/bills`, nessieBillSchema),
      ]);
      return { account, purchases, deposits, withdrawals, bills };
    },

    createCustomer: (body: unknown) => create("/customers", body),
    createAccount: (customerId: string, body: unknown) =>
      create(`/customers/${encodeURIComponent(customerId)}/accounts`, body),
    createMerchant: (body: unknown) => create("/merchants", body),
    createRecord: (
      accountId: string,
      kind: "purchases" | "deposits" | "withdrawals",
      body: unknown,
    ) => create(`/accounts/${encodeURIComponent(accountId)}/${kind}`, body),
    createBill: (accountId: string, body: unknown) =>
      create(`/accounts/${encodeURIComponent(accountId)}/bills`, body),

    /** Deposits can be deleted; purchases and withdrawals cannot (ADR-048). */
    deleteDeposit: async (id: string) => {
      await expectOk("DELETE", `/deposits/${encodeURIComponent(id)}`);
    },
    deleteBill: async (id: string) => {
      await expectOk("DELETE", `/bills/${encodeURIComponent(id)}`);
    },
    deleteAccount: async (id: string) => {
      await expectOk("DELETE", `/accounts/${encodeURIComponent(id)}`);
    },
  };
}

export type NessieClient = ReturnType<typeof nessieClient>;

function wait(attempt: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 300 * 2 ** attempt));
}

/** Nessie's own message, cut short. It never contains the key. */
function shortDetail(json: unknown): string | undefined {
  const text =
    typeof json === "string"
      ? json
      : json && typeof json === "object" && "message" in json
        ? String((json as { message: unknown }).message)
        : undefined;
  return text?.slice(0, 160);
}
