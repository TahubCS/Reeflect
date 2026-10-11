import { describe, expect, it } from "vitest";
import { createKeyedQueue } from "./queue.ts";

/** A promise that the test settles by hand. */
function gate() {
  let open!: () => void;
  const opened = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { open, opened };
}

describe("createKeyedQueue", () => {
  it("runs tasks with the same key one after another, in order", async () => {
    const enqueue = createKeyedQueue();
    const first = gate();
    const log: string[] = [];

    const a = enqueue("alice", async () => {
      log.push("a starts");
      await first.opened;
      log.push("a ends");
    });
    const b = enqueue("alice", async () => {
      log.push("b runs");
    });

    await Promise.resolve();
    expect(log).toEqual(["a starts"]);

    first.open();
    await Promise.all([a, b]);
    expect(log).toEqual(["a starts", "a ends", "b runs"]);
  });

  it("does not make one key wait for another", async () => {
    const enqueue = createKeyedQueue();
    const slow = gate();
    const log: string[] = [];

    const a = enqueue("alice", async () => {
      await slow.opened;
      log.push("alice");
    });
    await enqueue("bob", async () => {
      log.push("bob");
    });

    expect(log).toEqual(["bob"]);
    slow.open();
    await a;
    expect(log).toEqual(["bob", "alice"]);
  });

  it("carries on after a task fails", async () => {
    const enqueue = createKeyedQueue();
    const log: string[] = [];

    const failed = enqueue("alice", async () => {
      throw new Error("boom");
    });
    const next = enqueue("alice", async () => {
      log.push("still runs");
    });

    await expect(failed).resolves.toBeUndefined();
    await next;
    expect(log).toEqual(["still runs"]);
  });
});
