/**
 * Runs tasks that share a key one after another, in the order they were
 * added, while tasks with different keys run side by side. The worker keys
 * by conversation, so one person's texts are answered in order and nobody
 * waits behind someone else. A failing task does not stop the ones after it.
 */
export function createKeyedQueue(): (
  key: string,
  task: () => Promise<void>,
) => Promise<void> {
  const tails = new Map<string, Promise<void>>();

  return (key, task) => {
    const previous = tails.get(key) ?? Promise.resolve();
    const next = previous.then(task, task).catch(() => undefined);
    tails.set(key, next);
    // Forget the conversation once it is idle, so the map does not grow.
    void next.then(() => {
      if (tails.get(key) === next) tails.delete(key);
    });
    return next;
  };
}
