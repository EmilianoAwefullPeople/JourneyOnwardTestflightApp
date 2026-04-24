// colorQuantization
// Modified Median Cut Quantization (MMCQ) — extracts N dominant colors from a pixel array.
// Same algorithm used by node-vibrant and color-thief. O(n log n).

type RGB = [number, number, number];

// Reduce color depth to 5 bits per channel (32 levels) for histogram bucketing
const SIGBITS = 5;
const RSHIFT = 8 - SIGBITS;

function colorToIndex(r: number, g: number, b: number): number {
  return ((r >> RSHIFT) << (2 * SIGBITS)) | ((g >> RSHIFT) << SIGBITS) | (b >> RSHIFT);
}

// Build histogram: index → pixel count
function buildHistogram(pixels: RGB[]): Map<number, number> {
  const hist = new Map<number, number>();
  for (const [r, g, b] of pixels) {
    const idx = colorToIndex(r, g, b);
    hist.set(idx, (hist.get(idx) ?? 0) + 1);
  }
  return hist;
}

interface VBox {
  r1: number; r2: number;
  g1: number; g2: number;
  b1: number; b2: number;
  hist: Map<number, number>;
  count: number;
  avg: RGB;
}

function makeVBox(pixels: RGB[], hist: Map<number, number>): VBox {
  let r1 = 31, r2 = 0, g1 = 31, g2 = 0, b1 = 31, b2 = 0;
  let count = 0;
  let rSum = 0, gSum = 0, bSum = 0;

  for (const [r, g, b] of pixels) {
    const rq = r >> RSHIFT;
    const gq = g >> RSHIFT;
    const bq = b >> RSHIFT;
    const idx = colorToIndex(r, g, b);
    const n = hist.get(idx) ?? 1;

    if (rq < r1) r1 = rq;
    if (rq > r2) r2 = rq;
    if (gq < g1) g1 = gq;
    if (gq > g2) g2 = gq;
    if (bq < b1) b1 = bq;
    if (bq > b2) b2 = bq;
    count += n;
    rSum += r * n;
    gSum += g * n;
    bSum += b * n;
  }

  const avg: RGB = [
    Math.round(rSum / count),
    Math.round(gSum / count),
    Math.round(bSum / count),
  ];

  return { r1, r2, g1, g2, b1, b2, hist, count, avg };
}

// Split a VBox along its longest axis at the median frequency point
function splitVBox(vbox: VBox, pixels: RGB[]): [VBox, VBox] | null {
  const rRange = vbox.r2 - vbox.r1;
  const gRange = vbox.g2 - vbox.g1;
  const bRange = vbox.b2 - vbox.b1;

  type Channel = 'r' | 'g' | 'b';
  const longestAxis: Channel = rRange >= gRange && rRange >= bRange ? 'r'
    : gRange >= bRange ? 'g' : 'b';

  // Sort pixels along the longest axis
  const sortFn: Record<Channel, (a: RGB, b: RGB) => number> = {
    r: (a, b) => a[0] - b[0],
    g: (a, b) => a[1] - b[1],
    b: (a, b) => a[2] - b[2],
  };
  const sorted = [...pixels].sort(sortFn[longestAxis]);

  // Find median by cumulative count
  let cumCount = 0;
  const half = vbox.count / 2;
  let splitIdx = 0;
  for (let i = 0; i < sorted.length; i++) {
    const [r, g, b] = sorted[i];
    cumCount += vbox.hist.get(colorToIndex(r, g, b)) ?? 1;
    if (cumCount >= half) {
      splitIdx = i;
      break;
    }
  }

  if (splitIdx === 0) splitIdx = 1;
  if (splitIdx >= sorted.length - 1) splitIdx = sorted.length - 2;

  const left = sorted.slice(0, splitIdx + 1);
  const right = sorted.slice(splitIdx + 1);

  if (left.length === 0 || right.length === 0) return null;

  return [makeVBox(left, vbox.hist), makeVBox(right, vbox.hist)];
}

function toHex(rgb: RGB): string {
  const [r, g, b] = rgb;
  return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
}

/**
 * Returns `numColors` dominant colors from the pixel array as hex strings,
 * sorted by descending pixel count (most dominant first).
 *
 * Falls back to fewer colors if the image doesn't have enough distinct regions.
 */
export function mmcq(pixels: RGB[], numColors: number): string[] {
  if (pixels.length === 0) return [];

  const hist = buildHistogram(pixels);
  const queue: { vbox: VBox; pixels: RGB[] }[] = [
    { vbox: makeVBox(pixels, hist), pixels },
  ];

  // Pixel-per-vbox map for iteration (key = vbox reference index)
  const pixelMap = new Map<VBox, RGB[]>();
  pixelMap.set(queue[0].vbox, pixels);

  while (queue.length < numColors) {
    // Pick the box with the largest count (most pixels)
    queue.sort((a, b) => b.vbox.count - a.vbox.count);
    const { vbox, pixels: vboxPixels } = queue[0];

    const split = splitVBox(vbox, vboxPixels);
    if (!split) {
      // Can't split further; done
      break;
    }

    const [left, right] = split;
    const splitPoint = Math.floor(vboxPixels.length / 2);
    const sortFn = (a: RGB, b: RGB): number => {
      const rRange = vbox.r2 - vbox.r1;
      const gRange = vbox.g2 - vbox.g1;
      const bRange = vbox.b2 - vbox.b1;
      if (rRange >= gRange && rRange >= bRange) return a[0] - b[0];
      if (gRange >= bRange) return a[1] - b[1];
      return a[2] - b[2];
    };
    const sortedPixels = [...vboxPixels].sort(sortFn);
    const leftPixels = sortedPixels.slice(0, splitPoint);
    const rightPixels = sortedPixels.slice(splitPoint);

    // Replace the split box with its two halves
    queue.shift();
    if (leftPixels.length > 0) queue.push({ vbox: left, pixels: leftPixels });
    if (rightPixels.length > 0) queue.push({ vbox: right, pixels: rightPixels });
  }

  // Sort by count descending and convert averages to hex
  queue.sort((a, b) => b.vbox.count - a.vbox.count);
  return queue.slice(0, numColors).map(({ vbox }) => toHex(vbox.avg));
}
