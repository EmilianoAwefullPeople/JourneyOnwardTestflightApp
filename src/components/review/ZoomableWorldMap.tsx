// ZoomableWorldMap
// Pinch-to-zoom-and-pan world map that stays vector-crisp at every zoom level.
//
// A native ScrollView's zoom (minimumZoomScale/maximumZoomScale) just stretches
// whatever was already rasterized at 1x — fine up to 1x, blurry past it, exactly
// like zooming a photo beyond 100%. Instead, this tracks pinch/pan and, once the
// gesture settles, re-renders the underlying <Svg> at a pixel size that actually
// covers the current zoom level (rounded up), so react-native-svg redraws real
// vector paths at that resolution instead of stretching the old raster. The live
// transform's scale factor is always <= 1 relative to that freshly-rendered
// size, so it's shrinking a high-res raster (looks fine) rather than stretching
// a low-res one (looks blurry).
//
// No react-native-reanimated: it's installed but its worklet registration
// crashes at module-evaluation time in this app's current (non-New-Architecture)
// setup — see PostcardFramedPhotoSlot.tsx for the same constraint. Uses RNGH's
// .runOnJS(true) (JS-thread callbacks) + Animated.Value.setValue() instead,
// matching that component's established pattern.

import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Animated, LayoutChangeEvent, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import type { ThemeColors } from '../../config/theme';
import type { CountryVisitCategory } from '../../storage/countryCategoryStorage';
import WorldMapSvg from './WorldMapSvg';

const MIN_SCALE = 1;
const MAX_SCALE = 6;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

interface ZoomableWorldMapProps {
  categories: Record<string, CountryVisitCategory>;
  colors: ThemeColors;
  highlightCategory?: CountryVisitCategory | null;
}

// In-gesture state lives in a ref so rapid pinch/pan updates don't re-render.
type MapGestureState = {
  scale: number;
  tx: number;
  ty: number;
  startScale: number;
  startTx: number;
  startTy: number;
  vw: number;
  vh: number;
};

const ZoomableWorldMap: React.FC<ZoomableWorldMapProps> = ({ categories, colors, highlightCategory }) => {
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const [renderScale, setRenderScale] = useState(1);
  const renderScaleRef = useRef(1);

  const stateRef = useRef<MapGestureState>({
    scale: 1,
    tx: 0,
    ty: 0,
    startScale: 1,
    startTx: 0,
    startTy: 0,
    vw: 0,
    vh: 0,
  });

  const animTranslateX = useRef(new Animated.Value(0)).current;
  const animTranslateY = useRef(new Animated.Value(0)).current;
  const animScale = useRef(new Animated.Value(1)).current;

  // Fit the map's 2:1 aspect ratio within the container, like resizeMode="contain".
  const baseWidth = useMemo(
    () =>
      containerSize.width > 0 && containerSize.height > 0
        ? Math.min(containerSize.width, containerSize.height * 2)
        : 0,
    [containerSize]
  );
  const baseHeight = baseWidth * 0.5;

  // Clamp tx/ty against the current scale, then push to the Animated values.
  // The scale pushed to Animated compensates for whatever resolution the SVG is
  // currently rendered at, so the on-screen size stays correct as renderScale changes.
  const applyState = useCallback(() => {
    const { vw, vh } = stateRef.current;
    const scale = clamp(stateRef.current.scale, MIN_SCALE, MAX_SCALE);
    stateRef.current.scale = scale;
    const contentW = baseWidth * scale;
    const contentH = baseHeight * scale;
    const maxTx = Math.max(0, (contentW - vw) / 2);
    const maxTy = Math.max(0, (contentH - vh) / 2);
    const tx = clamp(stateRef.current.tx, -maxTx, maxTx);
    const ty = clamp(stateRef.current.ty, -maxTy, maxTy);
    stateRef.current.tx = tx;
    stateRef.current.ty = ty;
    animTranslateX.setValue(tx);
    animTranslateY.setValue(ty);
    animScale.setValue(scale / renderScaleRef.current);
  }, [baseWidth, baseHeight, animTranslateX, animTranslateY, animScale]);

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    stateRef.current.vw = width;
    stateRef.current.vh = height;
    setContainerSize({ width, height });
  }, []);

  // Called once a pinch settles: bump the actual <Svg> resolution up to cover
  // the current zoom (rounded up), so it never has to be stretched past native res.
  const commitRenderScale = useCallback(() => {
    const next = clamp(Math.ceil(stateRef.current.scale), MIN_SCALE, MAX_SCALE);
    if (next !== renderScaleRef.current) {
      renderScaleRef.current = next;
      setRenderScale(next);
    }
    animScale.setValue(stateRef.current.scale / renderScaleRef.current);
  }, [animScale]);

  const resetZoom = useCallback(() => {
    stateRef.current.scale = 1;
    stateRef.current.tx = 0;
    stateRef.current.ty = 0;
    renderScaleRef.current = 1;
    setRenderScale(1);
    applyState();
  }, [applyState]);

  // .runOnJS(true) → callbacks execute on the JS thread. No Reanimated worklets.
  const pinch = useMemo(
    () =>
      Gesture.Pinch()
        .runOnJS(true)
        .onBegin(() => {
          stateRef.current.startScale = stateRef.current.scale;
        })
        .onUpdate((e) => {
          stateRef.current.scale = stateRef.current.startScale * e.scale;
          applyState();
        })
        .onEnd(() => {
          commitRenderScale();
        }),
    [applyState, commitRenderScale]
  );

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .runOnJS(true)
        .onBegin(() => {
          stateRef.current.startTx = stateRef.current.tx;
          stateRef.current.startTy = stateRef.current.ty;
        })
        .onUpdate((e) => {
          stateRef.current.tx = stateRef.current.startTx + e.translationX;
          stateRef.current.ty = stateRef.current.startTy + e.translationY;
          applyState();
        }),
    [applyState]
  );

  const doubleTap = useMemo(
    () =>
      Gesture.Tap()
        .runOnJS(true)
        .numberOfTaps(2)
        .onEnd(() => {
          resetZoom();
        }),
    [resetZoom]
  );

  const composed = useMemo(
    () => Gesture.Race(doubleTap, Gesture.Simultaneous(pinch, pan)),
    [doubleTap, pinch, pan]
  );

  return (
    <View style={styles.container} onLayout={onLayout}>
      {baseWidth > 0 ? (
        <GestureDetector gesture={composed}>
          <Animated.View
            collapsable={false}
            style={{
              transform: [{ translateX: animTranslateX }, { translateY: animTranslateY }, { scale: animScale }],
            }}
          >
            <WorldMapSvg
              categories={categories}
              width={baseWidth * renderScale}
              colors={colors}
              highlightCategory={highlightCategory}
            />
          </Animated.View>
        </GestureDetector>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
});

export default ZoomableWorldMap;
