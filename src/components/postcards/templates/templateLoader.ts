import React from 'react';
import { logger } from '../../../utils/logger';
import { getTemplateById } from '../../../config/templateRegistry';
import {
  DEFAULT_POSTCARD_PHOTO_TRANSFORM,
  type Postcard,
  type PostcardPhotoTransform,
} from '../../../models/Postcard';
import type { Entry } from '../../../models/Entry';
import type { TemplateSlot } from './sharedTypes';

export interface ExtraSlot {
  path: string | null;
  transform: PostcardPhotoTransform;
}

/** Normalize template IDs: 'two-photo-stack' or 'T11' → 'T-11' */
export function normalizeTemplateId(id: string): string {
  if (id === 'two-photo-stack' || id === 'T11') return 'T-11';
  return id;
}

/** Number of photo slots a template supports (registry `maxPhotos`, falls back to the legacy 4-slot default). */
export function getMaxSlotsForTemplate(templateId: string): number {
  const entry = getTemplateById(normalizeTemplateId(templateId));
  return entry?.maxPhotos ?? 4;
}

export function loadTemplateComponent(templateId: string): React.ComponentType<any> | null {
  const norm = normalizeTemplateId(templateId);
  try {
    switch (norm) {
      case 'T-01':
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        return require('./T01QuadCollageTemplate').default;
      case 'T-02':
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        return require('./T02CameraViewfinderTemplate').default;
      case 'T-04':
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        return require('./T04LocationTagTemplate').default;
      case 'T-03':
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        return require('./T03StatementCardTemplate').default;
      case 'T-05':
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        return require('./T05iMessageTemplate').default;
      case 'T-06':
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        return require('./T06VerticalTriptychTemplate').default;
      case 'T-07':
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        return require('./T07MonthCalendarTemplate').default;
      case 'T-12':
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        return require('./T12MapPinTemplate').default;
      case 'T-11':
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        return require('./T11DiptychTemplate').default;
      case 'C-01':
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        return require('./C01TwoRowsTemplate').default;
      case 'C-02':
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        return require('./C02ThreeRowsTemplate').default;
      case 'C-03':
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        return require('./C03TwoByTwoTemplate').default;
      case 'C-04':
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        return require('./C04TwoByThreeTemplate').default;
      case 'C-05':
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        return require('./C05OneAboveTwoBelowTemplate').default;
      default:
        // Fallback to T-11 for legacy IDs
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        return require('./T11DiptychTemplate').default;
    }
  } catch (e) {
    logger.error('templateLoader: failed to load template', { templateId: norm, error: e });
    return null;
  }
}

/**
 * Builds the full slot list (photo + transform per slot) for a saved postcard.
 * Slots 0-3 come from the legacy photo1-4 columns; slots beyond that (collages
 * with more than 4 photos) are packed into `templateData.extraSlots` since the
 * `postcards` table only has 4 dedicated photo columns.
 *
 * `entries` (pass the live AppContext list) resolves `templateData.slotEntryIds`
 * back to real Entry objects — several templates (location tag, "If you're
 * reading this...", iMessage, quad collage, etc.) render destination/weather/date
 * text sourced from the slot's linked entry, not from the photo itself.
 */
export function buildSlotsFromPostcard(
  postcard: Postcard,
  templateId?: string,
  entries: Entry[] = []
): TemplateSlot[] {
  const maxSlots = getMaxSlotsForTemplate(templateId ?? postcard.templateId);

  const paths: (string | null)[] = [
    postcard.photo1Path,
    postcard.photo2Path,
    postcard.photo3Path ?? null,
    postcard.photo4Path ?? null,
  ];
  const transforms: PostcardPhotoTransform[] = [
    postcard.photo1Transform ?? DEFAULT_POSTCARD_PHOTO_TRANSFORM,
    postcard.photo2Transform ?? DEFAULT_POSTCARD_PHOTO_TRANSFORM,
    postcard.photo3Transform ?? DEFAULT_POSTCARD_PHOTO_TRANSFORM,
    postcard.photo4Transform ?? DEFAULT_POSTCARD_PHOTO_TRANSFORM,
  ];

  const extraSlots = Array.isArray(postcard.templateData?.extraSlots)
    ? (postcard.templateData!.extraSlots as ExtraSlot[])
    : [];
  for (let i = 4; i < maxSlots; i++) {
    const extra = extraSlots[i - 4];
    paths.push(extra?.path ?? null);
    transforms.push(extra?.transform ?? DEFAULT_POSTCARD_PHOTO_TRANSFORM);
  }

  const slotEntryIds = Array.isArray(postcard.templateData?.slotEntryIds)
    ? (postcard.templateData!.slotEntryIds as (string | null)[])
    : [];
  const entryById = new Map(entries.map((e) => [e.id, e]));

  return paths.slice(0, maxSlots).map((photoUri, i) => ({
    photoUri,
    transform: transforms[i] ?? DEFAULT_POSTCARD_PHOTO_TRANSFORM,
    resetKey: 0,
    entry: (slotEntryIds[i] ? entryById.get(slotEntryIds[i]!) : undefined) ?? null,
  }));
}

/**
 * Packs in-memory photo/transform slot arrays into the legacy 4-column shape
 * plus `extraSlots` (for slots 5+) to store under `Postcard.templateData`.
 */
export function packPostcardPhotoFields(
  photos: (string | null)[],
  transforms: PostcardPhotoTransform[]
): {
  photo1Path: string | null;
  photo2Path: string | null;
  photo3Path: string | null;
  photo4Path: string | null;
  photo1Transform: PostcardPhotoTransform;
  photo2Transform: PostcardPhotoTransform;
  photo3Transform: PostcardPhotoTransform;
  photo4Transform: PostcardPhotoTransform;
  extraSlots: ExtraSlot[];
} {
  const pathAt = (i: number) => photos[i] ?? null;
  const transformAt = (i: number) => transforms[i] ?? DEFAULT_POSTCARD_PHOTO_TRANSFORM;

  const extraSlots: ExtraSlot[] = [];
  for (let i = 4; i < photos.length; i++) {
    extraSlots.push({ path: pathAt(i), transform: transformAt(i) });
  }

  return {
    photo1Path: pathAt(0),
    photo2Path: pathAt(1),
    photo3Path: pathAt(2),
    photo4Path: pathAt(3),
    photo1Transform: transformAt(0),
    photo2Transform: transformAt(1),
    photo3Transform: transformAt(2),
    photo4Transform: transformAt(3),
    extraSlots,
  };
}
