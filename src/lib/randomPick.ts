// Uniform random picks without replacement (partial Fisher-Yates). `rand` is injectable for tests.
export function pickRandomN<T>(items: readonly T[], n: number, rand: () => number = Math.random): T[] {
  const pool = items.slice();
  const take = Math.max(0, Math.min(Math.floor(n), pool.length));
  for (let i = 0; i < take; i++) {
    const j = i + Math.min(Math.floor(rand() * (pool.length - i)), pool.length - i - 1);
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, take);
}