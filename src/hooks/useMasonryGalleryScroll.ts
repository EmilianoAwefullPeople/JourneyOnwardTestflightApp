import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native';
import {
  computeVisibleMasonryIndices,
  visibleIndicesToKey,
  type MasonryColumnsLayout,
} from '../utils/galleryMasonryLayout';
import { useFeedMediaPriority, type ImagePriority } from './useFeedMediaPriority';

type Options<T> = {
  layout: MasonryColumnsLayout<T>;
  photoUris: (string | null)[];
  /** Y offset within scroll content where the masonry grid starts (e.g. header / filter row height). */
  contentTop: number;
  viewportHeight: number;
  /** Multiplier applied to viewport height for the load window. Default 1.25. */
  bufferMultiplier?: number;
};

type WindowState = {
  key: string;
  indices: Set<number>;
};

function computeWindow<T>(
  layout: MasonryColumnsLayout<T>,
  scrollY: number,
  viewportHeight: number,
  contentTop: number,
  bufferPx: number,
): WindowState {
  const indices = computeVisibleMasonryIndices(
    layout,
    scrollY,
    viewportHeight,
    contentTop,
    bufferPx,
  );
  return { key: visibleIndicesToKey(indices), indices };
}

/**
 * Scroll-driven masonry windowing + viewability-based image priority/prefetch.
 * Scroll position is kept in a ref; React state updates only when the visible tile set changes.
 */
export function useMasonryGalleryScroll<T>({
  layout,
  photoUris,
  contentTop,
  viewportHeight,
  bufferMultiplier = 1.25,
}: Options<T>) {
  const scrollYRef = useRef(0);
  const layoutRef = useRef(layout);
  const contentTopRef = useRef(contentTop);
  const viewportHeightRef = useRef(viewportHeight);
  const bufferPxRef = useRef(viewportHeight * bufferMultiplier);
  const scrollSideEffectRef = useRef<((offsetY: number) => void) | undefined>(undefined);

  layoutRef.current = layout;
  contentTopRef.current = contentTop;
  viewportHeightRef.current = viewportHeight;
  bufferPxRef.current = viewportHeight * bufferMultiplier;

  const [windowState, setWindowState] = useState<WindowState>(() =>
    computeWindow(layout, 0, viewportHeight, contentTop, viewportHeight * bufferMultiplier)
  );

  const syncWindow = useCallback((scrollY: number) => {
    scrollYRef.current = scrollY;
    const next = computeWindow(
      layoutRef.current,
      scrollY,
      viewportHeightRef.current,
      contentTopRef.current,
      bufferPxRef.current,
    );
    setWindowState((prev) => (prev.key === next.key ? prev : next));
  }, []);

  useEffect(() => {
    syncWindow(scrollYRef.current);
  }, [layout, contentTop, viewportHeight, bufferMultiplier, syncWindow]);

  const { priorityByUri, resetPrefetch } = useFeedMediaPriority(photoUris, windowState.key);

  const isMediaActive = useCallback(
    (globalIndex: number) => windowState.indices.has(globalIndex),
    [windowState.indices],
  );

  const getPriorityForUri = useCallback(
    (uri: string | null | undefined): ImagePriority => {
      if (!uri) return 'normal';
      return priorityByUri.get(uri) ?? 'low';
    },
    [priorityByUri],
  );

  /** Update masonry window from a scroll offset without requiring a native event. */
  const notifyScroll = useCallback(
    (offsetY: number) => {
      syncWindow(offsetY);
    },
    [syncWindow],
  );

  const onScrollNative = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const y = e.nativeEvent.contentOffset.y;
      syncWindow(y);
      scrollSideEffectRef.current?.(y);
    },
    [syncWindow],
  );

  /** Stable ScrollView handler; optional side effect (e.g. reportScrollOffset) via ref. */
  const wrapOnScroll = useCallback((handler?: (offsetY: number) => void) => {
    scrollSideEffectRef.current = handler;
    return onScrollNative;
  }, [onScrollNative]);

  return {
    scrollY: scrollYRef.current,
    notifyScroll,
    onScroll: onScrollNative,
    wrapOnScroll,
    visibleIndices: windowState.indices,
    isMediaActive,
    getPriorityForUri,
    priorityByUri,
    resetPrefetch,
  };
};
