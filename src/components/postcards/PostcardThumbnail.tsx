import React, { useEffect, useMemo, useState } from 'react';
import { Dimensions } from 'react-native';
import {
  normalizeTemplateId,
  loadTemplateComponent,
  buildSlotsFromPostcard,
} from './templates/templateLoader';
import { useAppContext } from '../../context/AppContext';
import { getOrCreatePostcardPhotoThumbnails } from '../../storage/mediaStorage';
import { DEFAULT_POSTCARD_PHOTO_TRANSFORM, Postcard } from '../../models/Postcard';
import { SPACING } from '../../config/constants';

/** Reference width postcard templates render at full-size (matches PostcardEditorScreen's templateWidth). */
export const POSTCARD_FULL_SIZE_WIDTH = Dimensions.get('window').width - SPACING.lg * 2;

const ASPECT_RATIO_BY_KEY: Record<Postcard['aspectRatio'], number> = {
  '1:1': 1,
  '4:5': 4 / 5,
  '9:16': 9 / 16,
};

const noop = () => {};

interface PostcardThumbnailProps {
  postcard: Postcard;
  /** Rendered width in points; scale is derived against POSTCARD_FULL_SIZE_WIDTH so fixed template internals (padding, fonts) shrink proportionally. */
  width: number;
}

/** Read-only rendered preview of a saved postcard, used for gallery/list thumbnails. */
const PostcardThumbnail: React.FC<PostcardThumbnailProps> = ({ postcard, width }) => {
  const { entries } = useAppContext();
  const templateId = normalizeTemplateId(postcard.templateId);
  const isT11 = templateId === 'T-11';
  const aspectRatio = ASPECT_RATIO_BY_KEY[postcard.aspectRatio];
  const scale = Math.max(0.3, Math.min(1, width / POSTCARD_FULL_SIZE_WIDTH));

  const TemplateComponent = useMemo(
    () => loadTemplateComponent(postcard.templateId),
    [postcard.templateId]
  );

  // `entry` links (for destination/weather/date text — see buildSlotsFromPostcard) resolve
  // synchronously from already-loaded entries; photo URIs are swapped for lighter cached
  // copies below once they're ready, so this list still reflects the original full-res paths.
  const slots = useMemo(
    () => buildSlotsFromPostcard(postcard, postcard.templateId, entries),
    [postcard, entries]
  );

  // Postcard photo slots reference their original source (an entry's full-resolution photo,
  // or a camera-roll asset), which can be several MB each — too heavy to decode for every
  // tile in a scrolling grid. Swap in disk-cached, downsized copies once generated; render the
  // originals in the meantime so the thumbnail isn't blank on first mount.
  const sourcePhotoPaths = useMemo(() => slots.map((s) => s.photoUri), [slots]);
  const sourcePhotoPathsKey = sourcePhotoPaths.join('|');
  const [displayPhotoPaths, setDisplayPhotoPaths] = useState<(string | null)[]>(sourcePhotoPaths);

  useEffect(() => {
    let cancelled = false;
    setDisplayPhotoPaths(sourcePhotoPaths);
    getOrCreatePostcardPhotoThumbnails(postcard.id, sourcePhotoPaths)
      .then((resolved) => {
        if (!cancelled) setDisplayPhotoPaths(resolved);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postcard.id, sourcePhotoPathsKey]);

  const displaySlots = useMemo(
    () => slots.map((slot, i) => ({ ...slot, photoUri: displayPhotoPaths[i] ?? slot.photoUri })),
    [slots, displayPhotoPaths]
  );

  if (!TemplateComponent) {
    return null;
  }

  if (isT11) {
    return (
      <TemplateComponent
        topPhoto={displaySlots[0]?.photoUri ?? null}
        bottomPhoto={displaySlots[1]?.photoUri ?? null}
        onSlotPress={noop}
        onLabelPress={noop}
        onResetSlotFraming={noop}
        topLabel={postcard.label1}
        bottomLabel={postcard.label2}
        topTransform={postcard.photo1Transform ?? DEFAULT_POSTCARD_PHOTO_TRANSFORM}
        bottomTransform={postcard.photo2Transform ?? DEFAULT_POSTCARD_PHOTO_TRANSFORM}
        onTopTransformChange={noop}
        onBottomTransformChange={noop}
        aspectRatio={aspectRatio}
        previewMode
        scale={scale}
        editingChromeSuppressed
      />
    );
  }

  return (
    <TemplateComponent
      slots={displaySlots}
      onSlotPress={noop}
      onTransformChange={noop}
      onResetSlotFraming={noop}
      templateData={postcard.templateData ?? undefined}
      aspectRatio={aspectRatio}
      previewMode
      scale={scale}
      editingChromeSuppressed
      allEntries={entries}
    />
  );
};

export default PostcardThumbnail;
