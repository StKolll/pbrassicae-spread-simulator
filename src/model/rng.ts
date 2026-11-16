/** Small seeded pseudo-random generator (mulberry32), returns numbers in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** k distinct indices from [0, n), in random order (partial Fisher–Yates). */
export function sampleIndices(n: number, k: number, rand: () => number): number[] {
  if (k > n) throw new Error(`Cannot pick ${k} of ${n}`);
  const a = Array.from({ length: n }, (_, i) => i);
  for (let i = 0; i < k; i++) {
    const j = i + Math.floor(rand() * (n - i));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, k);
}
