import type { Entry } from '../models/Entry';

/** Preferred display URI for gallery tiles (thumbnail when available). */
export function getEntryGalleryPhotoUri(entry: Entry): string | null {
  if (entry.mediaType !== 'photo' || !entry.photoPaths?.length) return null;
  return entry.thumbPaths?.[0] || entry.photoPaths[0] || null;
}

/** Primary photo path key used for priority map lookups (matches feedUris). */
export function getEntryPhotoPriorityKey(entry: Entry): string | null {
  if (entry.mediaType !== 'photo' || !entry.photoPaths?.length) return null;
  return entry.photoPaths[0];
}

export function buildGalleryPhotoUrisFromEntries(entries: Entry[]): (string | null)[] {
  return entries.map((entry) => getEntryPhotoPriorityKey(entry));
}
