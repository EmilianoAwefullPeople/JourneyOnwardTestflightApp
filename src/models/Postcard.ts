export type PostcardPhotoTransform = {
  scale: number;
  translateX: number;
  translateY: number;
};

export const DEFAULT_POSTCARD_PHOTO_TRANSFORM: PostcardPhotoTransform = {
  scale: 1,
  translateX: 0,
  translateY: 0,
};

export interface Postcard {
  id: string;
  createdAt: string;
  updatedAt: string;
  templateId: string;
  aspectRatio: '1:1' | '4:5' | '9:16';
  photo1Path: string | null;
  photo2Path: string | null;
  label1: string;
  label2: string;
  downloaded: boolean;
  /** Pinch/pan framing for slot 1; omit or null for default. */
  photo1Transform?: PostcardPhotoTransform | null;
  /** Pinch/pan framing for slot 2; omit or null for default. */
  photo2Transform?: PostcardPhotoTransform | null;
  photo3Path?: string | null;
  photo3Transform?: PostcardPhotoTransform | null;
  photo4Path?: string | null;
  photo4Transform?: PostcardPhotoTransform | null;
  /** Template-specific data (slot entry IDs, etc.) stored as JSON. */
  templateData?: Record<string, unknown> | null;
}
