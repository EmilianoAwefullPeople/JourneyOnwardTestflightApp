// Shared concurrency utility for parallel async work with controlled concurrency.

/**
 * Runs `mapper` over `items` with at most `concurrency` tasks in flight at once.
 * Preserves result order. Throws on the first unhandled rejection (or AbortSignal abort).
 */
export async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>,
  signal?: AbortSignal
): Promise<R[]> {
  if (items.length === 0) return [];
  const results: R[] = new Array(items.length);
  let nextIndex = 0;
  const workerCount = Math.min(concurrency, items.length);
  const workers = Array.from({ length: workerCount }, async () => {
    while (true) {
      if (signal?.aborted) throw new Error('mapWithConcurrency: aborted');
      const i = nextIndex++;
      if (i >= items.length) break;
      results[i] = await mapper(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}
