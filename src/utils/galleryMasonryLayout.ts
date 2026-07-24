// galleryMasonryLayout
// Shortest-column masonry with per-tile Y offsets for scroll-windowed rendering.

export type MasonryPlacedItem<T> = {
  item: T;
  /** Pixel offset from the top of this column. */
  y: number;
  /** Total tile height including margins. */
  height: number;
  /** Index in the source display-order array (for priority / prefetch). */
  globalIndex: number;
};

export type MasonryColumnsLayout<T> = {
  left: MasonryPlacedItem<T>[];
  right: MasonryPlacedItem<T>[];
};

/** Shortest-column split with cumulative Y positions per column. */
export function buildMasonryColumnsLayout<T>(
  items: T[],
  estimateHeight: (item: T) => number,
): MasonryColumnsLayout<T> {
  const left: MasonryPlacedItem<T>[] = [];
  const right: MasonryPlacedItem<T>[] = [];
  let leftY = 0;
  let rightY = 0;
  let leftTotal = 0;
  let rightTotal = 0;

  items.forEach((item, globalIndex) => {
    const height = estimateHeight(item);
    if (leftTotal <= rightTotal) {
      left.push({ item, y: leftY, height, globalIndex });
      leftY += height;
      leftTotal += height;
    } else {
      right.push({ item, y: rightY, height, globalIndex });
      rightY += height;
      rightTotal += height;
    }
  });

  return { left, right };
}

export function computeVisibleMasonryIndices<T>(
  layout: MasonryColumnsLayout<T>,
  scrollY: number,
  viewportHeight: number,
  contentTop: number,
  bufferPx: number,
): Set<number> {
  const visible = new Set<number>();
  const viewMin = scrollY - bufferPx;
  const viewMax = scrollY + viewportHeight + bufferPx;

  const check = (placed: MasonryPlacedItem<T>) => {
    const top = contentTop + placed.y;
    const bottom = top + placed.height;
    if (bottom >= viewMin && top <= viewMax) {
      visible.add(placed.globalIndex);
    }
  };

  for (const placed of layout.left) check(placed);
  for (const placed of layout.right) check(placed);

  if (visible.size === 0) {
    const all = [...layout.left, ...layout.right].sort((a, b) => a.y - b.y || a.globalIndex - b.globalIndex);
    for (const placed of all) {
      const top = contentTop + placed.y;
      if (top <= scrollY + viewportHeight + bufferPx) {
        visible.add(placed.globalIndex);
        if (visible.size >= 6) break;
      }
    }
  }

  return visible;
}

export function visibleIndicesToKey(indices: Set<number>): string {
  return [...indices].sort((a, b) => a - b).join(',');
}
