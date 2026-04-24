// ColorExtractionService
// Extracts dominant color palettes from local photo files.
// Pipeline: expo-image-manipulator (resize to 100×100 PNG) → pngPixels (decode) → MMCQ (quantize).

import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { extractPNGPixels } from '../utils/pngPixels';
import { mmcq } from '../utils/colorQuantization';
import { logger } from '../utils/logger';

const SAMPLE_SIZE = 100; // resize target in pixels (width × height)
const NUM_COLORS = 8;

// URIs that are not local files and cannot be processed
function isNonLocalUri(uri: string): boolean {
  return (
    uri.startsWith('ph://') ||
    uri.startsWith('PH://') ||
    uri.startsWith('assets-library://') ||
    uri.startsWith('http://') ||
    uri.startsWith('https://')
  );
}

/**
 * Extracts up to NUM_COLORS dominant colors from a single local photo URI.
 * Returns an array of hex strings (most dominant first), or null on any failure.
 */
export async function extractColorPaletteFromPhoto(
  fileUri: string,
  numColors = NUM_COLORS
): Promise<string[] | null> {
  if (!fileUri || isNonLocalUri(fileUri)) return null;

  try {
    const result = await manipulateAsync(
      fileUri,
      [{ resize: { width: SAMPLE_SIZE, height: SAMPLE_SIZE } }],
      { format: SaveFormat.PNG, base64: true }
    );

    const base64 = result.base64;
    if (!base64) return null;

    const pixels = extractPNGPixels(base64);
    if (pixels.length < 10) return null;

    return mmcq(pixels, numColors);
  } catch (err) {
    logger.warn('ColorExtractionService: failed for', fileUri, err);
    return null;
  }
}

/**
 * Extracts color palettes for all photo URIs in an entry, sequentially.
 * Returns an array parallel to photoPaths; null for any photo that failed.
 */
export async function extractColorPalettesForEntry(
  photoPaths: string[],
  numColors = NUM_COLORS
): Promise<(string[] | null)[]> {
  const results: (string[] | null)[] = [];
  for (const uri of photoPaths) {
    const palette = await extractColorPaletteFromPhoto(uri, numColors);
    results.push(palette);
  }
  return results;
}
