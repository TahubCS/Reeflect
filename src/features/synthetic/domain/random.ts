// Seeded randomness. The same seed parts always give the same sequence, on
// any machine, so a batch can be replayed exactly (ADR-048). Not for security.

export type Random = {
  /** A number in [0, 1). */
  next(): number;
  /** A whole number from `min` to `max`, both included. */
  int(min: number, max: number): number;
  pick<T>(items: readonly T[]): T;
};

/** xmur3: a string → a well-mixed 32-bit seed. */
function hashSeed(text: string): number {
  let h = 1779033703 ^ text.length;
  for (let i = 0; i < text.length; i += 1) {
    h = Math.imul(h ^ text.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^ (h >>> 16)) >>> 0;
}

/**
 * A generator for one stream, e.g. `randomFor(seed, "p01", "2026-08", "income")`.
 * Each stream is independent, so adding a month or a spending category leaves
 * the other streams' numbers unchanged.
 */
export function randomFor(...parts: readonly string[]): Random {
  // mulberry32
  let state = hashSeed(parts.join("␟"));
  const next = () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    pick: (items) => {
      if (items.length === 0) throw new RangeError("Nothing to pick from");
      return items[Math.floor(next() * items.length)]!;
    },
  };
}
