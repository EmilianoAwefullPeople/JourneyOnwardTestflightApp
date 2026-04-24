// colorSpace
// Perceptual color utilities: hex ↔ CIELAB conversion, CIE76 ΔE distance, content hashing.

import { Entry } from '../models/Entry';

// ─── Hex ↔ sRGB ──────────────────────────────────────────────────────────────

function hexToRgb(hex: string): [number, number, number] | null {
  if (typeof hex !== 'string' || hex.length !== 7 || hex[0] !== '#') return null;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  if (isNaN(r) || isNaN(g) || isNaN(b)) return null;
  return [r / 255, g / 255, b / 255];
}

function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v * 255)));
  return '#' + [clamp(r), clamp(g), clamp(b)].map(v => v.toString(16).padStart(2, '0')).join('');
}

// ─── sRGB ↔ Linear RGB (gamma) ───────────────────────────────────────────────

function toLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function toSRGB(c: number): number {
  return c > 0.0031308 ? 1.055 * c ** (1 / 2.4) - 0.055 : 12.92 * c;
}

// ─── Linear RGB ↔ XYZ (D65) ──────────────────────────────────────────────────

function linearRgbToXyz(r: number, g: number, b: number): [number, number, number] {
  return [
    0.4124564 * r + 0.3575761 * g + 0.1804375 * b,
    0.2126729 * r + 0.7151522 * g + 0.0721750 * b,
    0.0193339 * r + 0.1191920 * g + 0.9503041 * b,
  ];
}

function xyzToLinearRgb(x: number, y: number, z: number): [number, number, number] {
  return [
     3.2404542 * x - 1.5371385 * y - 0.4985314 * z,
    -0.9692660 * x + 1.8760108 * y + 0.0415560 * z,
     0.0556434 * x - 0.2040259 * y + 1.0572252 * z,
  ];
}

// ─── XYZ ↔ CIELAB (D65 white point) ─────────────────────────────────────────

const Xn = 0.95047, Yn = 1.00000, Zn = 1.08883;

function labF(t: number): number {
  return t > 0.008856 ? t ** (1 / 3) : 7.787 * t + 16 / 116;
}

function labFInv(t: number): number {
  return t ** 3 > 0.008856 ? t ** 3 : (t - 16 / 116) / 7.787;
}

function xyzToLab(x: number, y: number, z: number): [number, number, number] {
  const fx = labF(x / Xn), fy = labF(y / Yn), fz = labF(z / Zn);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

function labToXyz(L: number, a: number, b: number): [number, number, number] {
  const fy = (L + 16) / 116;
  return [
    labFInv(fy + a / 500) * Xn,
    labFInv(fy) * Yn,
    labFInv(fy - b / 200) * Zn,
  ];
}

// ─── Public API ───────────────────────────────────────────────────────────────

/** Converts a 7-char hex string to CIELAB [L, a, b]. Returns [0,0,0] on invalid input. */
export function hexToLab(hex: string): [number, number, number] {
  const rgb = hexToRgb(hex);
  if (!rgb) return [0, 0, 0];
  const [rL, gL, bL] = rgb.map(toLinear) as [number, number, number];
  const [x, y, z] = linearRgbToXyz(rL, gL, bL);
  return xyzToLab(x, y, z);
}

/** Converts CIELAB [L, a, b] back to a 7-char hex string. */
export function labToHex(lab: [number, number, number]): string {
  const [x, y, z] = labToXyz(lab[0], lab[1], lab[2]);
  const [rL, gL, bL] = xyzToLinearRgb(x, y, z);
  return rgbToHex(toSRGB(rL), toSRGB(gL), toSRGB(bL));
}

/** CIE76 perceptual color distance. ΔE < 10 ≈ same family; > 20 ≈ clearly different. */
export function deltaE76(a: [number, number, number], b: [number, number, number]): number {
  return Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2);
}

// ─── Content hashing ─────────────────────────────────────────────────────────

function djb2Hash(str: string): string {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = (((hash << 5) + hash) ^ str.charCodeAt(i)) >>> 0;
  }
  return hash.toString(16);
}

/**
 * Produces a stable fingerprint of all colorPalettes data across scoped entries.
 * Returns the string 'empty' when no entries have palette data yet.
 */
export function computePaletteContentHash(entries: Entry[]): string {
  const parts = entries
    .filter(e => e.colorPalettes != null && e.colorPalettes.length > 0)
    .map(e => `${e.id}:${JSON.stringify(e.colorPalettes)}`)
    .sort();

  if (parts.length === 0) return 'empty';
  return djb2Hash(parts.join('|'));
}
