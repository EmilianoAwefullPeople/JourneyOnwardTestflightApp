// randomTripCover
// Picks a random photo from a trip for the Slideshow story cover, stable for the life of the
// JS session (resets on next app launch) so it doesn't jump around on every re-render.

import { Entry } from '../models/Entry';

/** First available photo URI for a trip (thumbnail preferred), in entry order. Deterministic —
 *  used as the Recap cover, which (unlike the Slideshow cover) doesn't need to be randomized. */
export function getFirstTripPhotoUri(albumId: string, entries: Entry[]): string | null {
  for (const entry of entries) {
    if (entry.albumId !== albumId) continue;
    if (entry.mediaType === 'photo' && entry.photoPaths && entry.photoPaths.length > 0) {
      return entry.thumbPaths?.[0] || entry.photoPaths[0];
    }
  }
  return null;
}

/** Every individual photo URI (thumbnail preferred) across a trip's entries, in entry order. */
export function getAllTripPhotoUris(albumId: string, entries: Entry[]): string[] {
  const uris: string[] = [];
  for (const entry of entries) {
    if (entry.albumId !== albumId) continue;
    if (entry.mediaType !== 'photo' || !entry.photoPaths?.length) continue;
    entry.photoPaths.forEach((path, i) => {
      if (!path) return;
      uris.push(entry.thumbPaths?.[i] || path);
    });
  }
  return uris;
}

// Module-level cache — persists for the JS session (cleared on app relaunch), keyed by trip.
const sessionCoverCache = new Map<string, string>();

/** Random photo URI for a trip's slideshow cover, cached for the rest of this session. */
export function getSessionRandomTripPhoto(albumId: string, photoUris: string[]): string | null {
  if (photoUris.length === 0) return null;
  const cached = sessionCoverCache.get(albumId);
  if (cached && photoUris.includes(cached)) return cached;
  const chosen = photoUris[Math.floor(Math.random() * photoUris.length)];
  sessionCoverCache.set(albumId, chosen);
  return chosen;
}
