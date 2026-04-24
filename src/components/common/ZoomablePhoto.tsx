import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  GestureResponderEvent,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { EntryPhotoImage } from './EntryPhotoImage';

type ZoomablePhotoProps = {
  uri: string;
  width: number;
  height: number;
  fallbackBackgroundColor: string;
  resizeMode?: 'cover' | 'contain' | 'stretch' | 'center' | 'repeat';
  maximumZoomScale?: number;
  onTap?: () => void;
  onZoomStateChange?: (isZoomed: boolean) => void;
  resetKey?: string | number;
  isActive?: boolean;
  suppressTap?: boolean;
};

const ZOOM_EPSILON = 0.01;
const TAP_MAX_MOVEMENT_PX = 10;
const TAP_MAX_DURATION_MS = 250;

export const ZoomablePhoto: React.FC<ZoomablePhotoProps> = ({
  uri,
  width,
  height,
  fallbackBackgroundColor,
  resizeMode = 'cover',
  maximumZoomScale = 4,
  onTap,
  onZoomStateChange,
  resetKey,
  isActive = true,
  suppressTap = false,
}) => {
  const scrollRef = useRef<ScrollView | null>(null);
  const [isZoomed, setIsZoomed] = useState(false);
  const previousZoomedRef = useRef<boolean | null>(null);
  const pinchInProgressRef = useRef(false);
  const pinchOccurredRef = useRef(false);
  const latestZoomScaleRef = useRef(1);
  const touchStartXRef = useRef(0);
  const touchStartYRef = useRef(0);
  const touchStartTsRef = useRef(0);
  const dragOccurredRef = useRef(false);

  const containerStyle = useMemo(
    () => [styles.container, { width, height }],
    [width, height]
  );

  const imageStyle = useMemo(
    () => ({ width, height }),
    [width, height]
  );

  const updateZoomState = (nextZoomed: boolean) => {
    setIsZoomed(nextZoomed);
  };

  const applyNativeZoomReset = () => {
    const scrollNode = scrollRef.current as any;
    if (!scrollNode) {
      return;
    }

    const responder =
      typeof scrollNode.getScrollResponder === 'function'
        ? scrollNode.getScrollResponder()
        : scrollNode;

    if (responder && typeof responder.scrollResponderZoomTo === 'function') {
      responder.scrollResponderZoomTo({
        x: 0,
        y: 0,
        width,
        height,
        animated: false,
      });
    } else {
      scrollNode.setNativeProps?.({ zoomScale: 1 });
    }
  };

  const resetToOriginal = useCallback(() => {
    applyNativeZoomReset();
    scrollRef.current?.scrollTo({ x: 0, y: 0, animated: false });
    updateZoomState(false);
    pinchInProgressRef.current = false;
    pinchOccurredRef.current = false;
    dragOccurredRef.current = false;
    latestZoomScaleRef.current = 1;
  }, [width, height]);

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (Platform.OS !== 'ios') {
      return;
    }
    const zoomScale = event.nativeEvent.zoomScale ?? 1;
    latestZoomScaleRef.current = zoomScale;
    const currentlyZoomed = zoomScale > 1 + ZOOM_EPSILON;
    if (currentlyZoomed) {
      pinchOccurredRef.current = true;
    }
    updateZoomState(currentlyZoomed);
  };

  const handleTouchEnd = (event: GestureResponderEvent) => {
    const touches = (event.nativeEvent as any).touches;
    const hasRemainingTouches = Array.isArray(touches) && touches.length > 0;
    const endedPinch = pinchInProgressRef.current && !hasRemainingTouches;

    if (endedPinch) {
      if (latestZoomScaleRef.current > 1 + ZOOM_EPSILON || pinchOccurredRef.current) {
        resetToOriginal();
      } else {
        pinchInProgressRef.current = false;
        pinchOccurredRef.current = false;
      }
      return;
    }

    if (!onTap || isZoomed || pinchOccurredRef.current || dragOccurredRef.current || suppressTap) {
      dragOccurredRef.current = false;
      return;
    }

    const touchDurationMs = Date.now() - touchStartTsRef.current;
    if (touchDurationMs > TAP_MAX_DURATION_MS) {
      dragOccurredRef.current = false;
      return;
    }

    const changedTouches = (event.nativeEvent as any).changedTouches;
    if (!changedTouches || changedTouches.length === 1) {
      onTap();
    }
    dragOccurredRef.current = false;
  };

  const handleTouchMove = (event: GestureResponderEvent) => {
    const touches = (event.nativeEvent as any).touches;
    if (Array.isArray(touches) && touches.length >= 2) {
      pinchInProgressRef.current = true;
      pinchOccurredRef.current = true;
      return;
    }

    if (Array.isArray(touches) && touches.length === 1) {
      const touch = touches[0];
      const dx = touch.pageX - touchStartXRef.current;
      const dy = touch.pageY - touchStartYRef.current;
      const movedFar = Math.hypot(dx, dy) > TAP_MAX_MOVEMENT_PX;
      if (movedFar) {
        dragOccurredRef.current = true;
      }
    }
  };

  const handleTouchStart = (event: GestureResponderEvent) => {
    const touches = (event.nativeEvent as any).touches;
    if (Array.isArray(touches) && touches.length === 1) {
      const touch = touches[0];
      touchStartXRef.current = touch.pageX;
      touchStartYRef.current = touch.pageY;
      touchStartTsRef.current = Date.now();
      dragOccurredRef.current = false;
    }
  };

  useEffect(() => {
    resetToOriginal();
    // resetKey intentionally triggers reset on demand
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  useEffect(() => {
    if (!isActive) {
      resetToOriginal();
    }
    // isActive only used to reset when this view becomes inactive
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive]);

  useEffect(() => {
    if (previousZoomedRef.current === null) {
      previousZoomedRef.current = isZoomed;
      return;
    }
    if (previousZoomedRef.current !== isZoomed) {
      onZoomStateChange?.(isZoomed);
      previousZoomedRef.current = isZoomed;
    }
  }, [isZoomed, onZoomStateChange]);

  useEffect(() => {
    return () => {
      onZoomStateChange?.(false);
    };
  }, [onZoomStateChange]);

  return (
    <View style={containerStyle} onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd}>
      <ScrollView
        ref={scrollRef}
        style={StyleSheet.absoluteFill}
        contentContainerStyle={[styles.scrollContent, { width, height }]}
        minimumZoomScale={1}
        maximumZoomScale={maximumZoomScale}
        bouncesZoom={false}
        pinchGestureEnabled
        showsVerticalScrollIndicator={false}
        showsHorizontalScrollIndicator={false}
        centerContent
        onScroll={handleScroll}
        scrollEventThrottle={16}
      >
        <EntryPhotoImage
          uri={uri}
          style={imageStyle}
          resizeMode={resizeMode}
          fallbackBackgroundColor={fallbackBackgroundColor}
        />
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
