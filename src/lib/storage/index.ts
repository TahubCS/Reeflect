import "server-only";
import { Agent } from "node:https";
import { Files, FilesError } from "files-sdk";
import { neon } from "files-sdk/neon";
import { env } from "@/lib/env";

// The statements bucket in Neon object storage (ADR-053), through Neon's
// Files SDK adapter. Every environment uses a Neon branch's bucket: local
// development and tests use the `storage-tests` branch, deployments their
// own branch (ADR-053). Server-only; the browser never gets a key or a URL
// to an object. Never log an object's body: it holds a person's
// transactions.

export type ObjectStore = {
  put(key: string, body: string, contentType: string): Promise<void>;
  /** The object as text, or null when there is no object at `key`. */
  get(key: string): Promise<string | null>;
  delete(key: string): Promise<void>;
  /** Every key that starts with `prefix`. */
  listKeys(prefix: string): Promise<string[]>;
  /** Deletes every object whose key starts with `prefix`. */
  deletePrefix(prefix: string): Promise<void>;
};

/** A Neon branch's storage, as `neon env pull` writes it. */
export type NeonStorageConfig = {
  accessKeyId: string;
  secretAccessKey: string;
  endpoint: string;
  region: string;
  bucket: string;
};

export function createObjectStore(config: NeonStorageConfig): ObjectStore {
  // Credentials are passed in, never taken from a machine-wide default, so
  // only the validated Neon branch values are ever used.
  const adapter = neon({
    bucket: config.bucket,
    endpoint: config.endpoint,
    region: config.region,
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
  });
  // The SDK creates its own agent, so Node's global proxy flag alone does
  // not route storage requests through a managed workspace's HTTPS proxy.
  if (process.env.HTTPS_PROXY || process.env.https_proxy) {
    const handler = adapter.raw.config.requestHandler;
    if (
      "updateHttpClientConfig" in handler &&
      typeof handler.updateHttpClientConfig === "function"
    ) {
      handler.updateHttpClientConfig(
        "httpsAgent",
        new Agent({ keepAlive: true, proxyEnv: process.env }),
      );
    }
  }
  const files = new Files({ adapter });
  async function listKeys(prefix: string): Promise<string[]> {
    const keys: string[] = [];
    let cursor: string | undefined;
    do {
      const page = await files.list({ prefix, cursor });
      keys.push(...page.items.map((item) => item.key));
      cursor = page.cursor;
    } while (cursor);
    return keys;
  }

  return {
    async put(key, body, contentType) {
      await files.upload(key, body, { contentType });
    },
    async get(key) {
      try {
        return await (await files.download(key)).text();
      } catch (error) {
        if (error instanceof FilesError && error.code === "NotFound")
          return null;
        throw error;
      }
    },
    async delete(key) {
      await files.delete(key);
    },
    listKeys,
    async deletePrefix(prefix) {
      const keys = await listKeys(prefix);
      if (keys.length > 0) await files.delete(keys);
    },
  };
}

let shared: ObjectStore | null | undefined;

/** The statements bucket, or null when Neon storage isn't configured. */
export function statementStore(): ObjectStore | null {
  if (shared !== undefined) return shared;
  const {
    AWS_ACCESS_KEY_ID,
    AWS_SECRET_ACCESS_KEY,
    AWS_ENDPOINT_URL_S3,
    AWS_REGION,
    STATEMENTS_BUCKET,
  } = env;
  shared =
    AWS_ACCESS_KEY_ID &&
    AWS_SECRET_ACCESS_KEY &&
    AWS_ENDPOINT_URL_S3 &&
    AWS_REGION &&
    STATEMENTS_BUCKET
      ? createObjectStore({
          accessKeyId: AWS_ACCESS_KEY_ID,
          secretAccessKey: AWS_SECRET_ACCESS_KEY,
          endpoint: AWS_ENDPOINT_URL_S3,
          region: AWS_REGION,
          bucket: STATEMENTS_BUCKET,
        })
      : null;
  return shared;
}
