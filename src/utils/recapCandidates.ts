// recapCandidates
// Pure logic: from entries and trip albums, return recap-capable candidates (trip albums with ≥1 entry).

import { Entry } from '../models/Entry';
import { TripAlbum } from '../models/TripAlbum';
import type { RecapCandidate } from '../models/Recap';

/**
 * Format date range for display (matches TripAlbumsSection).
 */
function formatDateRange(album: TripAlbum): string {
  try {
    const startDate = new Date(album.startDate);
    if (!Number.isFinite(startDate.getTime())) return album.startDate;
    const endDate = album.endDate ? new Date(album.endDate) : null;
    if (endDate != null && Number.isFinite(endDate.getTime())) {
      return `${startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
    }
    return startDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  } catch {
    return album.startDate;
  }
}

/**
 * Get display name for recap list (album name is primary; could later add location/year).
 */
function getDisplayName(album: TripAlbum): string {
  return album.name?.trim() || 'Trip';
}

/**
 * Get first 1–2 photo URIs from entries for list card preview.
 * Uses photoPaths then mediaPaths (same as TripAlbumsSection).
 */
function getPreviewUris(entries: Entry[], maxCount: number): string[] {
  const uris: string[] = [];
  for (const entry of entries) {
    if (uris.length >= maxCount) break;
    const paths = (entry.photoPaths?.length ? entry.photoPaths : entry.mediaPaths) ?? [];
    for (const p of paths) {
      if (p && typeof p === 'string') {
        uris.push(p);
        if (uris.length >= maxCount) break;
      }
    }
  }
  return uris;
}

/**
 * Returns recap-capable candidates: trip albums that have at least one entry.
 * Sorted by end date descending (most recent first); no endDate uses startDate for sort.
 * Pure, sync, no I/O.
 */
export function getRecapCandidates(entries: Entry[], tripAlbums: TripAlbum[]): RecapCandidate[] {
  if (!Array.isArray(entries) || !Array.isArray(tripAlbums)) {
    return [];
  }

  const candidates: RecapCandidate[] = [];

  for (const album of tripAlbums) {
    const albumEntries = entries.filter((e) => e.albumId === album.id && !e.isDraft);
    if (albumEntries.length === 0) continue;

    const sortedEntries = [...albumEntries].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
    const entryIds = sortedEntries.map((e) => e.id);
    const dateRange = formatDateRange(album);
    const displayName = getDisplayName(album);
    const previewImageUris = getPreviewUris(sortedEntries, 2);

    candidates.push({
      id: album.id,
      album,
      displayName,
      dateRange,
      entryIds,
      previewImageUris,
    });
  }

  candidates.sort((a, b) => {
    const endA = a.album.endDate ? new Date(a.album.endDate).getTime() : new Date(a.album.startDate).getTime();
    const endB = b.album.endDate ? new Date(b.album.endDate).getTime() : new Date(b.album.startDate).getTime();
    return endB - endA;
  });

  return candidates;
}
