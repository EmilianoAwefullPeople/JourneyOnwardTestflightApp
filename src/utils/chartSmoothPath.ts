export type ChartPoint = { x: number; y: number };

/**
 * Catmull–Rom spline converted to cubic Bézier segments (open path).
 * Requires at least two points. For two points, uses one cubic with duplicated endpoints.
 */
export function pointsToSmoothCurvePath(points: ChartPoint[]): string {
  const n = points.length;
  if (n < 2) return '';

  let d = '';
  for (let i = 0; i < n - 1; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(n - 1, i + 2)];

    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;

    if (i === 0) {
      d += `M ${p1.x} ${p1.y}`;
    }
    d += ` C ${cp1x} ${cp1y} ${cp2x} ${cp2y} ${p2.x} ${p2.y}`;
  }
  return d;
}

/** Closed path: smooth top edge plus fill down to bottomY and back. */
export function pointsToSmoothAreaPath(points: ChartPoint[], bottomY: number): string {
  const curve = pointsToSmoothCurvePath(points);
  if (!curve) return '';
  const first = points[0];
  const last = points[points.length - 1];
  return `${curve} L ${last.x} ${bottomY} L ${first.x} ${bottomY} Z`;
}
