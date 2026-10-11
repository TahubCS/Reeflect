import "server-only";
import {
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  NoSuchKey,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { env } from "@/lib/env";

// The statements bucket in Neon object storage (ADR-053), or S3Mock locally
// and in CI. S3-compatible: path-style addressing, SigV4. Server-only; the
// browser never gets a key or a URL to an object. Never log an object's
// body: it holds a person's transactions.

export type ObjectStore = {
  put(key: string, body: string, contentType: string): Promise<void>;
  /** The object as text, or null when there is no object at `key`. */
  get(key: string): Promise<string | null>;
  delete(key: string): Promise<void>;
  /** Deletes every object whose key starts with `prefix`. */
  deletePrefix(prefix: string): Promise<void>;
};

type StorageConfig = {
  accessKeyId: string;
  secretAccessKey: string;
  endpoint: string;
  region: string;
  bucket: string;
};

export function createObjectStore(config: StorageConfig): ObjectStore {
  const client = new S3Client({
    endpoint: config.endpoint,
    region: config.region,
    forcePathStyle: true,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
  const Bucket = config.bucket;
  return {
    async put(key, body, contentType) {
      await client.send(
        new PutObjectCommand({
          Bucket,
          Key: key,
          Body: body,
          ContentType: contentType,
        }),
      );
    },
    async get(key) {
      try {
        const object = await client.send(
          new GetObjectCommand({ Bucket, Key: key }),
        );
        return (await object.Body?.transformToString("utf-8")) ?? null;
      } catch (error) {
        if (error instanceof NoSuchKey) return null;
        throw error;
      }
    },
    async delete(key) {
      await client.send(new DeleteObjectCommand({ Bucket, Key: key }));
    },
    async deletePrefix(prefix) {
      let token: string | undefined;
      do {
        const page = await client.send(
          new ListObjectsV2Command({
            Bucket,
            Prefix: prefix,
            ContinuationToken: token,
          }),
        );
        const keys = (page.Contents ?? []).flatMap((item) =>
          item.Key ? [{ Key: item.Key }] : [],
        );
        if (keys.length > 0) {
          await client.send(
            new DeleteObjectsCommand({ Bucket, Delete: { Objects: keys } }),
          );
        }
        token = page.IsTruncated ? page.NextContinuationToken : undefined;
      } while (token);
    },
  };
}

let shared: ObjectStore | null | undefined;

/** The statements bucket, or null when object storage isn't configured. */
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
