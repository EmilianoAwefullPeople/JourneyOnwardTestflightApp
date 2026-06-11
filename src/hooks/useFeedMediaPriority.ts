import { useCallback, useEffect, useMemo, useRef } from 'react';
import { Image } from 'expo-image';

export type ImagePriority = 'low' | 'normal' | 'high';

const LOOKAHEAD = 6;
const LOOKBEHIND = 2;

function parseVisibleIndices(key: string, length: number): number[] {
  if (length <= 0) return [];
  if (!key.trim()) {
    return [0, 1, 2].filter((i) => i < length);
  }
  const seen = new Set<number>();
  const out: number[] = [];
  for (const part of key.split(',')) {
    const n = parseInt(part.trim(), 10);
    if (Number.isFinite(n) && n >= 0 && n < length && !seen.has(n)) {
      seen.add(n);
      out.push(n);
    }
  }
  out.sort((a, b) => a - b);
  if (out.length === 0) {
    return [0, 1, 2].filter((i) => i < length);
  }
  return out;
}

function rank(p: ImagePriority): number {
  if (p === 'high') return 3;
  if (p === 'normal') return 2;
  return 1;
}

function buildPriorityByUri(
  feedUris: (string | null)[],
  visibleIndices: number[],
): Map<string, ImagePriority> {
  const map = new Map<string, ImagePriority>();
  if (feedUris.length === 0 || visibleIndices.length === 0) return map;

  const visible = new Set(visibleIndices);
  const minV = Math.min(...visibleIndices);
  const maxV = Math.max(...visibleIndices);

  for (let i = 0; i < feedUris.length; i++) {
    const u = feedUris[i];
    if (!u) continue;
    let p: ImagePriority = 'low';
    if (visible.has(i)) {
      p = 'high';
    } else if (i > maxV && i <= maxV + LOOKAHEAD) {
      p = 'normal';
    } else if (i < minV && i >= minV - LOOKBEHIND) {
      p = 'low';
    }
    const prev = map.get(u);
    if (!prev || rank(p) > rank(prev)) {
      map.set(u, p);
    }
  }
  return map;
}

/**
 * Viewability-driven image priority + best-effort prefetch for a vertical feed.
 * `visibleKey` is comma-separated row indices (sorted), or empty string to seed 0,1,2.
 */
export function useFeedMediaPriority(
  feedUris: (string | null)[],
  visibleKey: string,
): { priorityByUri: Map<string, ImagePriority>; resetPrefetch: () => void } {
  const prefetchedRef = useRef<Set<string>>(new Set());

  const resetPrefetch = useCallback(() => {
    prefetchedRef.current.clear();
  }, []);

  const visibleIndices = useMemo(
    () => parseVisibleIndices(visibleKey, feedUris.length),
    [visibleKey, feedUris.length],
  );

  const priorityByUri = useMemo(
    () => buildPriorityByUri(feedUris, visibleIndices),
    [feedUris, visibleIndices],
  );

  useEffect(() => {
    if (feedUris.length === 0 || visibleIndices.length === 0) return;

    const minV = Math.min(...visibleIndices);
    const maxV = Math.max(...visibleIndices);

    const toPrefetchHigh: string[] = [];
    for (let i = maxV + 1; i <= Math.min(feedUris.length - 1, maxV + LOOKAHEAD); i++) {
      const u = feedUris[i];
      if (u && !prefetchedRef.current.has(u)) {
        prefetchedRef.current.add(u);
        toPrefetchHigh.push(u);
      }
    }

    const toPrefetchLow: string[] = [];
    for (let i = minV - 1; i >= Math.max(0, minV - LOOKBEHIND); i--) {
      const u = feedUris[i];
      if (u && !prefetchedRef.current.has(u)) {
        prefetchedRef.current.add(u);
        toPrefetchLow.push(u);
      }
    }

    let cancelled = false;
    void (async () => {
      try {
        if (toPrefetchHigh.length > 0) {
          await Image.prefetch(toPrefetchHigh, { cachePolicy: 'memory-disk' });
        }
        if (cancelled) return;
        if (toPrefetchLow.length > 0) {
          await Image.prefetch(toPrefetchLow, { cachePolicy: 'memory-disk' });
        }
      } catch {
        // Prefetch is best-effort
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [feedUris, visibleIndices]);

  return { priorityByUri, resetPrefetch };
}
