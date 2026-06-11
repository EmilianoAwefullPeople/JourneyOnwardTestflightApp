export type ChartPoint = { x: number; y: number };

function sign(x: number): number {
  return x < 0 ? -1 : x > 0 ? 1 : 0;
}

/**
 * Tangents for monotone Hermite (Steffen 1990), ported from d3-shape `curveMonotoneX` / `slope3`.
 * Prevents overshoot so non-negative counts never dip “below zero” on the chart.
 */
function slope3(x0: number, y0: number, x1: number, y1: number, x2: number, y2: number): number {
  const h0 = x1 - x0;
  const h1 = x2 - x1;
  // Match d3-shape `slope3` divisor quirks for h0/h1 === 0 (boolean coerced in JS; cast for TS).
  const s0 = (y1 - y0) / ((h0 || (h1 < 0 && -0)) as number);
  const s1 = (y2 - y1) / ((h1 || (h0 < 0 && -0)) as number);
  const p = (s0 * h1 + s1 * h0) / (h0 + h1);
  return (sign(s0) + sign(s1)) * Math.min(Math.abs(s0), Math.abs(s1), 0.5 * Math.abs(p)) || 0;
}

/** One-sided slope for endpoints (d3-shape `slope2`). */
function slope2(x0: number, y0: number, x1: number, y1: number, t: number): number {
  const h = x1 - x0;
  return h ? (3 * ((y1 - y0) / h) - t) / 2 : t;
}

/** Cubic Hermite segment as cubic Bézier (d3-shape `point`). */
function appendMonotoneCubic(
  d: string,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  t0: number,
  t1: number
): string {
  const dx = (x1 - x0) / 3;
  return `${d} C ${x0 + dx} ${y0 + dx * t0} ${x1 - dx} ${y1 - dx * t1} ${x1} ${y1}`;
}

/**
 * Open smooth path through points, monotone in x (Steffen / d3-shape monotoneX).
 * Unlike Catmull–Rom, does not undershoot flat plateaus before a spike — safe for counts ≥ 0.
 */
export function pointsToSmoothCurvePath(points: ChartPoint[]): string {
  const n = points.length;
  if (n < 2) return '';

  let d = '';
  let _x0 = NaN;
  let _y0 = NaN;
  let _x1 = NaN;
  let _y1 = NaN;
  let _t0 = NaN;
  let _point = 0;

  const moveTo = (x: number, y: number) => {
    d += `M ${x} ${y}`;
  };
  const lineTo = (x: number, y: number) => {
    d += ` L ${x} ${y}`;
  };

  for (let k = 0; k < n; k++) {
    const x = +points[k].x;
    const y = +points[k].y;
    if (x === _x1 && y === _y1) continue;

    let t1 = NaN;
    switch (_point) {
      case 0:
        _point = 1;
        _x0 = _x1 = x;
        _y0 = _y1 = y;
        moveTo(x, y);
        break;
      case 1:
        _point = 2;
        _x1 = x;
        _y1 = y;
        break;
      case 2:
        _point = 3;
        t1 = slope3(_x0, _y0, _x1, _y1, x, y);
        d = appendMonotoneCubic(d, _x0, _y0, _x1, _y1, slope2(_x0, _y0, _x1, _y1, t1), t1);
        _x0 = _x1;
        _y0 = _y1;
        _x1 = x;
        _y1 = y;
        _t0 = t1;
        break;
      default:
        t1 = slope3(_x0, _y0, _x1, _y1, x, y);
        d = appendMonotoneCubic(d, _x0, _y0, _x1, _y1, _t0, t1);
        _x0 = _x1;
        _y0 = _y1;
        _x1 = x;
        _y1 = y;
        _t0 = t1;
        break;
    }
  }

  switch (_point) {
    case 2:
      d += ` L ${_x1} ${_y1}`;
      break;
    case 3:
      d = appendMonotoneCubic(d, _x0, _y0, _x1, _y1, _t0, slope2(_x0, _y0, _x1, _y1, _t0));
      break;
    default:
      break;
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
