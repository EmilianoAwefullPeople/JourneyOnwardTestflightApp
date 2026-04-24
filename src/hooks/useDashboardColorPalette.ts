// useDashboardColorPalette
// Derives an aggregated color palette from scoped entries.
// Reads cache on mount for instant display, recomputes when content changes.

import { useEffect, useMemo, useRef, useState } from 'react';
import { Entry } from '../models/Entry';
import { computePaletteContentHash } from '../utils/colorSpace';
import { aggregatePalette } from '../utils/paletteAggregation';
import {
  CachedDashboardPalette,
  loadCachedPalette,
  saveCachedPalette,
} from '../storage/dashboardPaletteCache';

export type PaletteState = 'no-photos' | 'processing' | 'ready';

export interface DashboardColorPaletteResult {
  colors: string[];
  paletteState: PaletteState;
}

/**
 * Aggregates color palettes from scoped entries into a dashboard-level palette.
 *
 * - 'no-photos': no photo entries exist → show empty message
 * - 'processing': photo entries exist but palette data not yet extracted → show skeleton
 * - 'ready': palette is computed → show swatches
 *
 * Caches result in AsyncStorage per scope. Recomputes only when entry palette
 * data changes (content hash mismatch).
 */
export function useDashboardColorPalette(
  entries: Entry[],
  scope: string
): DashboardColorPaletteResult {
  const [colors, setColors] = useState<string[]>([]);
  const [paletteState, setPaletteState] = useState<PaletteState>('no-photos');

  // Tracks the hash that was last written to cache to avoid redundant saves
  const lastSavedHashRef = useRef<string | null>(null);

  // ── Determine what photo data is available ────────────────────────────────

  const hasPhotoEntries = useMemo(
    () => entries.some(e => e.mediaType === 'photo' && (e.photoPaths?.length ?? 0) > 0),
    [entries]
  );

  // Stable fingerprint of all palette data in scope — changes only when
  // colorPalettes content on any entry changes or entries are added/removed.
  const contentHash = useMemo(
    () => computePaletteContentHash(entries),
    [entries]
  );

  // ── Load cache on mount for instant first-frame display ──────────────────

  useEffect(() => {
    loadCachedPalette(scope).then(cached => {
      if (cached && cached.colors.length > 0) {
        setColors(cached.colors);
        setPaletteState('ready');
        lastSavedHashRef.current = cached.contentHash;
      }
    }).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope]);

  // ── Validate cache and recompute when hash changes ───────────────────────

  useEffect(() => {
    if (!hasPhotoEntries) {
      setPaletteState('no-photos');
      return;
    }

    if (contentHash === 'empty') {
      setPaletteState('processing');
      return;
    }

    let cancelled = false;

    (async () => {
      // Check whether the cached result is still valid
      const cached = await loadCachedPalette(scope);
      if (!cancelled && cached?.contentHash === contentHash && cached.colors.length > 0) {
        setColors(cached.colors);
        setPaletteState('ready');
        lastSavedHashRef.current = contentHash;
        return;
      }

      // Cache is stale or missing — recompute
      if (!cancelled) setPaletteState('processing');

      const photoEntries = entries.filter(
        e => e.colorPalettes != null && e.colorPalettes.length > 0
      );

      const newColors = aggregatePalette(photoEntries, 10);

      if (cancelled) return;

      if (newColors.length === 0) {
        // Has entries with palettes but clustering didn't produce enough distinct colors.
        // Keep 'processing' so the skeleton remains visible rather than showing nothing.
        setPaletteState('processing');
        return;
      }

      const cacheEntry: CachedDashboardPalette = {
        colors: newColors,
        photoCount: photoEntries.reduce((n, e) => n + (e.colorPalettes?.length ?? 0), 0),
        entryCount: photoEntries.length,
        contentHash,
        scope,
        computedAt: new Date().toISOString(),
      };

      setColors(newColors);
      setPaletteState('ready');

      // Save only if hash actually changed (avoids redundant AsyncStorage writes)
      if (lastSavedHashRef.current !== contentHash) {
        lastSavedHashRef.current = contentHash;
        saveCachedPalette(scope, cacheEntry).catch(() => {});
      }
    })();

    return () => { cancelled = true; };
  }, [contentHash, scope, hasPhotoEntries, entries]);

  return { colors, paletteState };
}
