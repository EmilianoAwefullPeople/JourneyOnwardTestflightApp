// Recap Model
// Types for Journey Recap: candidates (trip albums eligible for recap) and slides (story-style cards)

import { TripAlbum } from './TripAlbum';

/** A trip album that has at least one entry and can be turned into a recap. */
export interface RecapCandidate {
  id: string; // album id
  album: TripAlbum;
  displayName: string;
  dateRange: string;
  entryIds: string[];
  previewImageUris: string[]; // first 1–2 for list card
}

/** Slide type for the recap player. */
export type RecapSlideType = 'title' | 'stat' | 'highlight' | 'collage' | 'outro';

/** Payload for title slide. */
export interface RecapSlideTitlePayload {
  displayName: string;
  startDate: string;
  endDate: string;
  /** Optional line above the title (e.g. "Your journey"). */
  subtitle?: string;
}

/** Payload for stat slide. */
export interface RecapSlideStatPayload {
  value: number;
  label: string;
  /** Optional line above the value (e.g. "You captured", "You had"). */
  prefix?: string;
}

/** Payload for highlight slide (single entry photo). */
export interface RecapSlideHighlightPayload {
  entryId: string;
  mediaUri: string;
  caption?: string;
}

/** Payload for collage slide (2–4 images). */
export interface RecapSlideCollagePayload {
  entryIds: string[];
  mediaUris: string[];
  /** Optional one-line label above the grid (e.g. "Your highlights"). */
  label?: string;
}

/** Payload for outro slide. */
export interface RecapSlideOutroPayload {
  message: string;
}

export type RecapSlidePayload =
  | { type: 'title'; payload: RecapSlideTitlePayload }
  | { type: 'stat'; payload: RecapSlideStatPayload }
  | { type: 'highlight'; payload: RecapSlideHighlightPayload }
  | { type: 'collage'; payload: RecapSlideCollagePayload }
  | { type: 'outro'; payload: RecapSlideOutroPayload };

/** A single slide in the recap sequence. */
export interface RecapSlide {
  id: string;
  type: RecapSlideType;
  durationMs: number;
  /** Type-narrowed payload; use slide.type to discriminate. */
  payload: RecapSlideTitlePayload | RecapSlideStatPayload | RecapSlideHighlightPayload | RecapSlideCollagePayload | RecapSlideOutroPayload;
}
