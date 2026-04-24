// pngPixels
// Decodes a base64 PNG string into an array of [R, G, B] tuples.
// Handles color types 2 (RGB) and 6 (RGBA). Uses pako for IDAT decompression.

import { inflate } from 'pako';

type RGB = [number, number, number];

function base64ToUint8Array(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function readUint32BE(buf: Uint8Array, offset: number): number {
  return ((buf[offset] << 24) | (buf[offset + 1] << 16) | (buf[offset + 2] << 8) | buf[offset + 3]) >>> 0;
}

// PNG filter reconstruction (per-scanline, left-to-right)
function unfilterScanline(
  filter: number,
  scanline: Uint8Array,
  prev: Uint8Array,
  bpp: number
): void {
  const len = scanline.length;
  switch (filter) {
    case 0: break; // None
    case 1: // Sub
      for (let i = bpp; i < len; i++) scanline[i] = (scanline[i] + scanline[i - bpp]) & 0xff;
      break;
    case 2: // Up
      for (let i = 0; i < len; i++) scanline[i] = (scanline[i] + prev[i]) & 0xff;
      break;
    case 3: // Average
      for (let i = 0; i < len; i++) {
        const a = i >= bpp ? scanline[i - bpp] : 0;
        const b = prev[i];
        scanline[i] = (scanline[i] + Math.floor((a + b) / 2)) & 0xff;
      }
      break;
    case 4: { // Paeth
      for (let i = 0; i < len; i++) {
        const a = i >= bpp ? scanline[i - bpp] : 0;
        const b = prev[i];
        const c = i >= bpp ? prev[i - bpp] : 0;
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        const pr = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
        scanline[i] = (scanline[i] + pr) & 0xff;
      }
      break;
    }
    default: break;
  }
}

/**
 * Decodes a base64-encoded PNG into an array of [R, G, B] tuples.
 * Returns an empty array on any parse failure (caller should treat as missing data).
 */
export function extractPNGPixels(base64: string): RGB[] {
  try {
    const buf = base64ToUint8Array(base64);

    // Validate PNG signature (8 bytes)
    const PNG_SIG = [137, 80, 78, 71, 13, 10, 26, 10];
    for (let i = 0; i < 8; i++) {
      if (buf[i] !== PNG_SIG[i]) return [];
    }

    // Parse chunks to find IHDR and all IDAT
    let width = 0;
    let height = 0;
    let colorType = 0; // 2 = RGB, 6 = RGBA
    const idatChunks: Uint8Array[] = [];
    let pos = 8;

    while (pos < buf.length) {
      const chunkLen = readUint32BE(buf, pos);
      const chunkType = String.fromCharCode(buf[pos + 4], buf[pos + 5], buf[pos + 6], buf[pos + 7]);
      const dataStart = pos + 8;

      if (chunkType === 'IHDR') {
        width = readUint32BE(buf, dataStart);
        height = readUint32BE(buf, dataStart + 4);
        // buf[dataStart + 8] = bit depth (8 expected)
        colorType = buf[dataStart + 9];
      } else if (chunkType === 'IDAT') {
        idatChunks.push(buf.slice(dataStart, dataStart + chunkLen));
      } else if (chunkType === 'IEND') {
        break;
      }

      pos = dataStart + chunkLen + 4; // skip CRC (4 bytes)
    }

    if (width === 0 || height === 0 || idatChunks.length === 0) return [];
    if (colorType !== 2 && colorType !== 6) return []; // only RGB / RGBA

    // Concatenate IDAT chunks and inflate
    const totalLen = idatChunks.reduce((s, c) => s + c.length, 0);
    const combined = new Uint8Array(totalLen);
    let offset = 0;
    for (const chunk of idatChunks) {
      combined.set(chunk, offset);
      offset += chunk.length;
    }

    const raw = inflate(combined);

    // Each scanline: 1 filter byte + (width * bpp) data bytes
    const bpp = colorType === 6 ? 4 : 3;
    const stride = width * bpp;
    const pixels: RGB[] = [];
    let prev = new Uint8Array(stride);

    for (let row = 0; row < height; row++) {
      const rowStart = row * (stride + 1);
      const filter = raw[rowStart];
      const scanline = raw.slice(rowStart + 1, rowStart + 1 + stride);
      unfilterScanline(filter, scanline, prev, bpp);

      for (let col = 0; col < width; col++) {
        const i = col * bpp;
        pixels.push([scanline[i], scanline[i + 1], scanline[i + 2]]);
      }

      prev = scanline;
    }

    return pixels;
  } catch {
    return [];
  }
}
