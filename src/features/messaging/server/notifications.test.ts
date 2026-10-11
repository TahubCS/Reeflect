import { inArray } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db/client";
import { notificationSetting, user } from "@/lib/db/schema";
import { DEFAULT_QUIET_HOURS } from "../domain/quiet-hours";
import {
  getQuietHours,
  quietHoursUndoableAt,
  setQuietHours,
  setQuietHoursByText,
  undoQuietHours,
} from "./notifications";

// Integration tests: they need the PostgreSQL from `docker compose up -d`
// (or the CI service), migrated. See TEST-05.

const userIds: string[] = [];
const HOUR_MS = 60 * 60 * 1000;
const NIGHT = { startMinute: 23 * 60, endMinute: 7 * 60 };
const LATE = { startMinute: 0, endMinute: 6 * 60 };

async function newUser(): Promise<string> {
  const userId = crypto.randomUUID();
  await db
    .insert(user)
    .values({ id: userId, name: "Test", email: `${userId}@example.test` });
  userIds.push(userId);
  return userId;
}

afterAll(async () => {
  await db.delete(user).where(inArray(user.id, userIds));
});

describe("quiet hours", () => {
  it("are 9 PM to 9 AM until the user sets them", async () => {
    expect(await getQuietHours(await newUser())).toEqual(DEFAULT_QUIET_HOURS);
  });

  it("are kept per user", async () => {
    const me = await newUser();
    const other = await newUser();
    await setQuietHours(me, NIGHT);

    expect(await getQuietHours(me)).toEqual(NIGHT);
    expect(await getQuietHours(other)).toEqual(DEFAULT_QUIET_HOURS);
  });

  it("refuses equal or out-of-range times, in code and in the database", async () => {
    const me = await newUser();
    await expect(
      setQuietHours(me, { startMinute: 60, endMinute: 60 }),
    ).rejects.toThrow("invalid quiet hours");
    await expect(
      setQuietHoursByText(me, { startMinute: 0, endMinute: 1440 }),
    ).rejects.toThrow("invalid quiet hours");
    await expect(
      db.insert(notificationSetting).values({
        userId: me,
        quietStartMinute: 60,
        quietEndMinute: 60,
      }),
    ).rejects.toThrow();
  });

  it("undoes a text change, back to what it replaced, only once", async () => {
    const me = await newUser();
    const now = new Date();
    await setQuietHours(me, NIGHT);
    await setQuietHoursByText(me, LATE, now);
    const since = new Date(now.getTime() - HOUR_MS);

    expect(await getQuietHours(me)).toEqual(LATE);
    expect(await quietHoursUndoableAt(me, since)).toEqual(now);
    expect(await undoQuietHours(me, since)).toEqual(NIGHT);
    expect(await getQuietHours(me)).toEqual(NIGHT);

    expect(await quietHoursUndoableAt(me, since)).toBeNull();
    expect(await undoQuietHours(me, since)).toBeNull();
  });

  it("undoes a first text change back to the defaults", async () => {
    const me = await newUser();
    await setQuietHoursByText(me, LATE);
    const since = new Date(Date.now() - HOUR_MS);

    expect(await undoQuietHours(me, since)).toEqual(DEFAULT_QUIET_HOURS);
  });

  it("cannot undo a text change older than the window", async () => {
    const me = await newUser();
    const then = new Date(Date.now() - 25 * HOUR_MS);
    await setQuietHoursByText(me, LATE, then);
    const since = new Date(Date.now() - 24 * HOUR_MS);

    expect(await quietHoursUndoableAt(me, since)).toBeNull();
    expect(await undoQuietHours(me, since)).toBeNull();
    expect(await getQuietHours(me)).toEqual(LATE);
  });

  it("cannot undo a text change after the website has set them", async () => {
    const me = await newUser();
    await setQuietHoursByText(me, LATE);
    await setQuietHours(me, NIGHT);

    expect(await undoQuietHours(me, new Date(Date.now() - HOUR_MS))).toBeNull();
    expect(await getQuietHours(me)).toEqual(NIGHT);
  });

  it("are deleted with the user", async () => {
    const me = await newUser();
    await setQuietHours(me, NIGHT);
    await db.delete(user).where(inArray(user.id, [me]));

    expect(await getQuietHours(me)).toEqual(DEFAULT_QUIET_HOURS);
  });
});
