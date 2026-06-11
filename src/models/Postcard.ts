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
  topPhotoPath: string | null;
  bottomPhotoPath: string | null;
  topLabel: string;
  bottomLabel: string;
  downloaded: boolean;
  /** Pinch/pan framing for the top slot; omit or null for default. */
  topPhotoTransform?: PostcardPhotoTransform | null;
  /** Pinch/pan framing for the bottom slot; omit or null for default. */
  bottomPhotoTransform?: PostcardPhotoTransform | null;
  photo3Path?: string | null;
  photo3Transform?: PostcardPhotoTransform | null;
  photo4Path?: string | null;
  photo4Transform?: PostcardPhotoTransform | null;
  /** Template-specific data (badge type for T-12, slot entry IDs, etc.) stored as JSON. */
  templateData?: Record<string, unknown> | null;
}
