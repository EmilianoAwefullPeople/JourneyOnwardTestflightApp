// StoryPhoto
// Full-bleed photo for a story-style frame (portrait, e.g. the Memories slideshow). Most
// phone photos are portrait or near-square and crop fine with `cover`. Landscape / panoramic
// / square photos crop away too much of the image when forced to `cover` a tall frame, so
// those are instead shown uncropped (`contain`) over a blurred, cover-scaled copy of the same
// photo — the letterbox-with-blur pattern used by Instagram/TikTok stories.

import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { BlurView } from 'expo-blur';
import { measurePhotoDimensionsFromUri } from '../../utils/galleryAspectRatio';

interface StoryPhotoProps {
  uri: string;
  width: number;
  height: number;
  /** Source image aspect ratio (width / height) if already known, to skip async measuring. */
  knownAspectRatio?: number | null;
}

/**
 * Below this fraction of the image's width/height would survive a `cover` crop, switch to
 * `contain` + blurred backdrop instead. 0.6 keeps native portrait photos (3:4, 2:3, 9:16) on
 * the crisp edge-to-edge `cover` path and routes square/landscape/panoramic photos to the
 * letterbox treatment.
 */
const MIN_COVER_VISIBLE_FRACTION = 0.6;

function needsLetterbox(imageAspectRatio: number, frameAspectRatio: number): boolean {
  if (!Number.isFinite(imageAspectRatio) || imageAspectRatio <= 0) return false;
  const visibleFraction = Math.min(
    imageAspectRatio / frameAspectRatio,
    frameAspectRatio / imageAspectRatio
  );
  return visibleFraction < MIN_COVER_VISIBLE_FRACTION;
}

const StoryPhoto: React.FC<StoryPhotoProps> = ({ uri, width, height, knownAspectRatio }) => {
  const [measuredAspectRatio, setMeasuredAspectRatio] = useState<number | null>(null);

  useEffect(() => {
    if (knownAspectRatio != null) return;
    let cancelled = false;
    measurePhotoDimensionsFromUri(uri).then((size) => {
      if (!cancelled && size) setMeasuredAspectRatio(size.width / size.height);
    });
    return () => {
      cancelled = true;
    };
  }, [uri, knownAspectRatio]);

  const aspectRatio = knownAspectRatio ?? measuredAspectRatio;
  const frameAspectRatio = width / height;
  // Unknown aspect ratio (still measuring): default to cover — most entries already carry
  // photoWidths/photoHeights, so this only briefly applies to legacy/backfilling entries.
  const letterbox = aspectRatio != null && needsLetterbox(aspectRatio, frameAspectRatio);

  if (!letterbox) {
    return (
      <ExpoImage
        source={{ uri }}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        cachePolicy="memory-disk"
        transition={0}
      />
    );
  }

  return (
    <View style={StyleSheet.absoluteFill}>
      <ExpoImage
        source={{ uri }}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        cachePolicy="memory-disk"
        transition={0}
      />
      <BlurView intensity={90} tint="dark" style={StyleSheet.absoluteFill} />
      <View style={styles.dimOverlay} />
      <ExpoImage
        source={{ uri }}
        style={StyleSheet.absoluteFill}
        contentFit="contain"
        cachePolicy="memory-disk"
        transition={0}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  dimOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
});

export default StoryPhoto;
