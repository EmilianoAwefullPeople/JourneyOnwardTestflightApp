import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Image, LayoutChangeEvent, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import type { PostcardPhotoTransform } from '../../models/Postcard';
import { clampPostcardPhotoTransform } from '../../utils/postcardFraming';

// No react-native-reanimated import. Reanimated 4's worklet registration runs at
// module evaluation time and crashes with Exception in HostFunction in this app's
// setup. Instead: RNGH gestures with .runOnJS(true) (JS-thread callbacks) +
// react-native Animated.Value.setValue() for synchronous frame-by-frame updates.

const MIN_SCALE = 1;

type Props = {
  uri: string;
  transform: PostcardPhotoTransform;
  onTransformChange: (next: PostcardPhotoTransform) => void;
  interactionEnabled?: boolean;
  maximumScale?: number;
  /** Increment to externally reset framing to the current transform prop. */
  resetKey?: number;
};

// All in-gesture state lives here — mutable ref means no re-renders during
// rapid pan/pinch updates.
type SlotState = {
  scale: number;
  tx: number;
  ty: number;
  startScale: number;
  startTx: number;
  startTy: number;
  vw: number;
  vh: number;
  iw: number;
  ih: number;
};

export const PostcardFramedPhotoSlot: React.FC<Props> = ({
  uri,
  transform,
  onTransformChange,
  interactionEnabled = true,
  maximumScale = 4,
  resetKey = 0,
}) => {
  const [broken, setBroken] = useState(false);

  // Always reflects the latest prop values without putting them in dep arrays.
  const transformRef = useRef(transform);
  transformRef.current = transform;
  const maxScaleRef = useRef(maximumScale);
  maxScaleRef.current = maximumScale;

  const stateRef = useRef<SlotState>({
    scale: transform.scale,
    tx: transform.translateX,
    ty: transform.translateY,
    startScale: 1,
    startTx: 0,
    startTy: 0,
    vw: 1,
    vh: 1,
    iw: 0,
    ih: 0,
  });

  // Animated values for the absolutely-positioned image frame.
  // setValue() is synchronous so display updates happen on the same JS turn as
  // the gesture callback — no perceptible lag for a static editing interaction.
  const animLeft = useRef(new Animated.Value(0)).current;
  const animTop = useRef(new Animated.Value(0)).current;
  const animWidth = useRef(new Animated.Value(0)).current;
  const animHeight = useRef(new Animated.Value(0)).current;
  const animOpacity = useRef(new Animated.Value(0)).current;

  // Clamp state, write it back to stateRef, then push to Animated values.
  const applyState = useCallback(() => {
    const { tx, ty, vw, vh, iw, ih } = stateRef.current;
    const scale = Math.min(maxScaleRef.current, Math.max(MIN_SCALE, stateRef.current.scale));
    if (iw <= 0 || ih <= 0 || vw <= 0 || vh <= 0) {
      animOpacity.setValue(0);
      return;
    }
    const base = Math.max(vw / iw, vh / ih);
    const w = iw * base * scale;
    const h = ih * base * scale;
    const maxTx = Math.max(0, (w - vw) / 2);
    const maxTy = Math.max(0, (h - vh) / 2);
    const clampedTx = Math.min(maxTx, Math.max(-maxTx, tx));
    const clampedTy = Math.min(maxTy, Math.max(-maxTy, ty));
    stateRef.current.scale = scale;
    stateRef.current.tx = clampedTx;
    stateRef.current.ty = clampedTy;
    animLeft.setValue((vw - w) / 2 + clampedTx);
    animTop.setValue((vh - h) / 2 + clampedTy);
    animWidth.setValue(w);
    animHeight.setValue(h);
    animOpacity.setValue(1);
  }, [animLeft, animTop, animWidth, animHeight, animOpacity]);

  // When the URI changes, reset framing to the incoming transform (DEFAULT when a
  // new photo is picked) and measure the new image's natural dimensions.
  useEffect(() => {
    const t = transformRef.current;
    stateRef.current.scale = t.scale;
    stateRef.current.tx = t.translateX;
    stateRef.current.ty = t.translateY;
    stateRef.current.iw = 0;
    stateRef.current.ih = 0;
    setBroken(false);
    animOpacity.setValue(0);
    Image.getSize(
      uri,
      (w, h) => {
        stateRef.current.iw = w > 0 ? w : 1;
        stateRef.current.ih = h > 0 ? h : 1;
        applyState();
      },
      () => {
        stateRef.current.iw = 1;
        stateRef.current.ih = 1;
        applyState();
      }
    );
  }, [uri, applyState, animOpacity]);

  // Explicit external reset (reset button): resetKey increments, skip mount (0).
  useEffect(() => {
    if (!resetKey) return;
    const t = transformRef.current;
    stateRef.current.scale = t.scale;
    stateRef.current.tx = t.translateX;
    stateRef.current.ty = t.translateY;
    applyState();
  }, [resetKey, applyState]);

  const onViewportLayout = useCallback(
    (e: LayoutChangeEvent) => {
      const { width, height } = e.nativeEvent.layout;
      stateRef.current.vw = Math.max(1, width);
      stateRef.current.vh = Math.max(1, height);
      applyState();
    },
    [applyState]
  );

  // Persist the final framing to the parent after each gesture ends.
  const commitTransform = useCallback(() => {
    const { scale, tx, ty, vw, vh, iw, ih } = stateRef.current;
    const next = clampPostcardPhotoTransform(
      vw, vh, iw, ih,
      { scale, translateX: tx, translateY: ty },
      maxScaleRef.current
    );
    onTransformChange(next);
  }, [onTransformChange]);

  // .runOnJS(true) → callbacks execute on the JS thread.
  // No Reanimated worklets, no 'worklet' directive, no module-level registration.
  const pinch = useMemo(
    () =>
      Gesture.Pinch()
        .runOnJS(true)
        .enabled(interactionEnabled)
        .onBegin(() => {
          stateRef.current.startScale = stateRef.current.scale;
        })
        .onUpdate((e) => {
          stateRef.current.scale = stateRef.current.startScale * e.scale;
          applyState();
        })
        .onEnd(() => {
          commitTransform();
        }),
    [interactionEnabled, applyState, commitTransform]
  );

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .runOnJS(true)
        .enabled(interactionEnabled)
        .onBegin(() => {
          stateRef.current.startTx = stateRef.current.tx;
          stateRef.current.startTy = stateRef.current.ty;
        })
        .onUpdate((e) => {
          stateRef.current.tx = stateRef.current.startTx + e.translationX;
          stateRef.current.ty = stateRef.current.startTy + e.translationY;
          applyState();
        })
        .onEnd(() => {
          commitTransform();
        }),
    [interactionEnabled, applyState, commitTransform]
  );

  const composed = useMemo(() => Gesture.Simultaneous(pinch, pan), [pinch, pan]);

  if (broken) {
    return (
      <View
        style={[styles.viewport, styles.fallback]}
        accessibilityLabel="Photo failed to load"
      />
    );
  }

  return (
    <View
      style={styles.viewport}
      onLayout={onViewportLayout}
      accessibilityLabel="Postcard photo"
      accessibilityHint={
        interactionEnabled
          ? 'Pinch to zoom and drag to reposition the photo within the frame.'
          : undefined
      }
    >
      <GestureDetector gesture={composed}>
        <Animated.View style={StyleSheet.absoluteFill} collapsable={false}>
          <Animated.View
            collapsable={false}
            style={{
              position: 'absolute',
              left: animLeft,
              top: animTop,
              width: animWidth,
              height: animHeight,
              opacity: animOpacity,
            }}
          >
            <Image
              source={{ uri }}
              style={StyleSheet.absoluteFill}
              resizeMode="stretch"
              onError={() => setBroken(true)}
              accessibilityIgnoresInvertColors
            />
          </Animated.View>
        </Animated.View>
      </GestureDetector>
    </View>
  );
};

const styles = StyleSheet.create({
  viewport: {
    flex: 1,
    overflow: 'hidden',
    backgroundColor: '#1a1a1a',
  },
  fallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
