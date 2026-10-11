import { MAX_PHOTO_BYTES, turnPhotoSchema } from "@reeflect/agent-protocol";
import { describe, expect, it } from "vitest";
import { loadPhoto } from "./photo.ts";

const source = (read: () => Promise<Uint8Array>) => ({
  mimeType: "image/jpeg" as const,
  read,
});

describe("loadPhoto", () => {
  it("carries the bytes as base64 the protocol accepts", async () => {
    const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00]);

    const photo = await loadPhoto(source(async () => bytes));

    expect(photo).toEqual({
      status: "attached",
      mimeType: "image/jpeg",
      data: Buffer.from(bytes).toString("base64"),
    });
    expect(turnPhotoSchema.safeParse(photo).success).toBe(true);
  });

  it("carries a picture exactly at the ceiling, and none above it", async () => {
    const atCeiling = await loadPhoto(
      source(async () => new Uint8Array(MAX_PHOTO_BYTES)),
    );
    expect(atCeiling.status).toBe("attached");
    expect(turnPhotoSchema.safeParse(atCeiling).success).toBe(true);

    // The platform's stated size was missing or wrong.
    expect(
      await loadPhoto(source(async () => new Uint8Array(MAX_PHOTO_BYTES + 1))),
    ).toEqual({ status: "too_large" });
  });

  it("is unavailable when the download fails, is empty, or is not bytes", async () => {
    const failing = source(async () => {
      throw new Error("chat +15551230001 not found");
    });
    expect(await loadPhoto(failing)).toEqual({ status: "unavailable" });
    expect(await loadPhoto(source(async () => new Uint8Array(0)))).toEqual({
      status: "unavailable",
    });
    expect(
      await loadPhoto(source(async () => "bytes" as unknown as Uint8Array)),
    ).toEqual({ status: "unavailable" });
  });

  it("is unavailable when the download takes too long", async () => {
    const never = source(() => new Promise<Uint8Array>(() => {}));

    expect(await loadPhoto(never, 10)).toEqual({ status: "unavailable" });
  });
});
