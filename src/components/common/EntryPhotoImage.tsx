// EntryPhotoImage — local file/remote URI with onError fallback (avoids empty gray tiles when load fails)
// Uses expo-image for disk/memory caching and faster first paint vs RN Image.

import React, { useEffect, useState } from 'react';
import { Animated, StyleSheet, View, Text, type StyleProp, type ImageStyle } from 'react-native';
import { Image, type ImageContentFit } from 'expo-image';
import type { ImagePriority } from '../../hooks/useFeedMediaPriority';

type Props = {
  uri: string;
  style: StyleProp<ImageStyle>;
  resizeMode?: 'cover' | 'contain' | 'stretch' | 'center' | 'repeat';
  fallbackBackgroundColor: string;
  priority?: ImagePriority;
  /** Optional placeholder behind the image while decoding (default: subtle shimmer). */
  placeholderContent?: React.ReactNode;
};

function toContentFit(resizeMode: Props['resizeMode']): ImageContentFit {
  switch (resizeMode) {
    case 'contain':
      return 'contain';
    case 'stretch':
      return 'fill';
    case 'center':
      return 'none';
    case 'repeat':
      return 'cover';
    case 'cover':
    default:
      return 'cover';
  }
}

// Single shared shimmer animation — one Animated.loop for all mounted instances.
// Reference-counted so the loop only runs while at least one shimmer is visible.
const _shimmer = {
  opacity: new Animated.Value(0.35),
  refCount: 0,
  loop: null as ReturnType<typeof Animated.loop> | null,
};

function useSharedShimmer(): Animated.Value {
  useEffect(() => {
    _shimmer.refCount++;
    if (_shimmer.refCount === 1) {
      _shimmer.loop = Animated.loop(
        Animated.sequence([
          Animated.timing(_shimmer.opacity, { toValue: 0.72, duration: 700, useNativeDriver: true }),
          Animated.timing(_shimmer.opacity, { toValue: 0.35, duration: 700, useNativeDriver: true }),
        ]),
      );
      _shimmer.loop.start();
    }
    return () => {
      _shimmer.refCount--;
      if (_shimmer.refCount === 0 && _shimmer.loop) {
        _shimmer.loop.stop();
        _shimmer.loop = null;
        _shimmer.opacity.setValue(0.35);
      }
    };
  }, []);
  return _shimmer.opacity;
}

function DefaultShimmer({ color }: { color: string }) {
  const opacity = useSharedShimmer();
  return (
    <Animated.View
      style={[StyleSheet.absoluteFillObject, { backgroundColor: color, opacity }]}
    />
  );
}

export const EntryPhotoImage: React.FC<Props> = ({
  uri,
  style,
  resizeMode = 'cover',
  fallbackBackgroundColor,
  priority = 'normal',
  placeholderContent,
}) => {
  const [broken, setBroken] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setBroken(false);
    setLoaded(false);
  }, [uri]);

  if (broken) {
    return (
      <View
        style={[
          style,
          {
            backgroundColor: fallbackBackgroundColor,
            alignItems: 'center',
            justifyContent: 'center',
          },
        ]}
      >
        <Text style={{ fontSize: 22 }} maxFontSizeMultiplier={1.25}>
          📷
        </Text>
      </View>
    );
  }

  return (
    <View style={style}>
      {!loaded && (
        <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
          {placeholderContent ?? <DefaultShimmer color={fallbackBackgroundColor} />}
        </View>
      )}
      <Image
        recyclingKey={uri}
        priority={priority}
        source={{ uri }}
        style={StyleSheet.absoluteFillObject}
        contentFit={toContentFit(resizeMode)}
        cachePolicy="memory-disk"
        transition={0}
        onLoad={() => setLoaded(true)}
        onError={() => setBroken(true)}
      />
    </View>
  );
};
