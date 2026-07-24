// galleryAspectRatio
// Shared width/height → aspect ratio logic for 2-column entry photo galleries.

import { Image } from 'react-native';
import type { Entry } from '../models/Entry';

/** React Native aspectRatio = width / height. 3:4 portrait default. */
export const DEFAULT_GALLERY_ASPECT_RATIO = 3 / 4;

export const MIN_GALLERY_ASPECT_RATIO = 0.45;
export const MAX_GALLERY_ASPECT_RATIO = 2.2;

export function clampGalleryAspectRatio(ratio: number): number {
  if (!Number.isFinite(ratio) || ratio <= 0) return DEFAULT_GALLERY_ASPECT_RATIO;
  return Math.min(Math.max(ratio, MIN_GALLERY_ASPECT_RATIO), MAX_GALLERY_ASPECT_RATIO);
}

/** Aspect ratio for gallery tile display (uses first photo by default). */
export function getGalleryAspectRatio(entry: Entry, photoIndex = 0): number {
  const w = entry.photoWidths?.[photoIndex];
  const h = entry.photoHeights?.[photoIndex];
  if (typeof w === 'number' && typeof h === 'number' && w > 0 && h > 0) {
    return clampGalleryAspectRatio(w / h);
  }
  return DEFAULT_GALLERY_ASPECT_RATIO;
}

export function getGalleryCardHeight(cardWidth: number, entry: Entry, photoIndex = 0): number {
  return cardWidth / getGalleryAspectRatio(entry, photoIndex);
}

/** Vertical space below image when an entry has a title line. */
export const GALLERY_ENTRY_TITLE_HEIGHT = 40;

/** Card marginBottom used in gallery tiles. */
export const GALLERY_CARD_MARGIN_BOTTOM = 12;

/** Total estimated height for an entry gallery tile (image + optional title + margin). */
export function getGalleryEntryTileHeight(cardWidth: number, entry: Entry): number {
  const mediaHeight = getGalleryCardHeight(cardWidth, entry);
  const titleHeight = entry.title ? GALLERY_ENTRY_TITLE_HEIGHT : 0;
  return mediaHeight + titleHeight + GALLERY_CARD_MARGIN_BOTTOM;
}

/** Shortest-column masonry split for 2-column galleries. */
export function distributeIntoTwoColumns<T>(
  items: T[],
  estimateHeight: (item: T) => number
): { leftColumn: T[]; rightColumn: T[] } {
  const leftColumn: T[] = [];
  const rightColumn: T[] = [];
  let leftHeight = 0;
  let rightHeight = 0;

  for (const item of items) {
    const tileHeight = estimateHeight(item);
    if (leftHeight <= rightHeight) {
      leftColumn.push(item);
      leftHeight += tileHeight;
    } else {
      rightColumn.push(item);
      rightHeight += tileHeight;
    }
  }

  return { leftColumn, rightColumn };
}

export function buildPhotoDimensionArrays(
  count: number,
  sources: Array<{ width?: number; height?: number } | null | undefined>
): { photoWidths?: number[]; photoHeights?: number[] } {
  if (count <= 0) return {};

  const photoWidths: number[] = [];
  const photoHeights: number[] = [];
  let anyValid = false;

  for (let i = 0; i < count; i++) {
    const s = sources[i];
    const w = s?.width;
    const h = s?.height;
    if (typeof w === 'number' && typeof h === 'number' && w > 0 && h > 0) {
      photoWidths.push(w);
      photoHeights.push(h);
      anyValid = true;
    } else {
      photoWidths.push(0);
      photoHeights.push(0);
    }
  }

  return anyValid ? { photoWidths, photoHeights } : {};
}

export function measurePhotoDimensionsFromUri(uri: string): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    Image.getSize(
      uri,
      (width, height) => {
        if (width > 0 && height > 0) resolve({ width, height });
        else resolve(null);
      },
      () => resolve(null)
    );
  });
}

export async function measurePhotoDimensionsFromUris(
  uris: string[]
): Promise<{ photoWidths?: number[]; photoHeights?: number[] }> {
  if (uris.length === 0) return {};

  const measured = await Promise.all(uris.map((uri) => measurePhotoDimensionsFromUri(uri)));
  return buildPhotoDimensionArrays(
    uris.length,
    measured.map((m) => (m ? { width: m.width, height: m.height } : null))
  );
}
