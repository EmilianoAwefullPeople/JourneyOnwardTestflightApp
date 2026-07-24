import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Image, LayoutChangeEvent, StyleSheet, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import AppText from '../../common/AppText';
import { PostcardFramedPhotoSlot } from '../PostcardFramedPhotoSlot';
import type { TemplateBaseProps } from './sharedTypes';
import {
  LOCAL_DELTA,
  SAFE_FRACTION,
  WORLD_REGION,
  clamp,
  parseMapRegion,
  pinOffsetForRegion,
  regionForPinOffset,
  type MapRegion,
} from './mapPinUtils';

const T12MapPinTemplate = React.forwardRef<View, TemplateBaseProps>(
  (
    {
      slots,
      onSlotPress,
      onTransformChange,
      onResetSlotFraming,
      templateData,
      onTemplateDataChange,
      aspectRatio = 4 / 5,
      editingChromeSuppressed = false,
      previewMode = false,
      scale = 1,
    },
    ref
  ) => {
    const clampedScale = Math.max(0.3, Math.min(1, scale));
    const s = (v: number) => Math.max(1, Math.round(v * clampedScale));

    const slot0 = slots[0] ?? { photoUri: null, transform: { scale: 1, translateX: 0, translateY: 0 }, resetKey: 0, entry: null };
    const entry = slot0.entry;
    const hasCoords = entry?.latitude != null && entry?.longitude != null;
    // Panning/zooming just needs a photo pinned; hasCoords only gates the safe-zone bounds
    // check below (nothing to keep the pin anchored to without a known coordinate).
    const interactive = !previewMode && !!slot0.photoUri;

    // --- Container size (needed to convert the map's region into pin screen-position) ---
    const containerSizeRef = useRef({ width: 0, height: 0 });

    // The pin's on-screen offset from center, kept in sync with the map's *actual* region via
    // onRegionChange below (Animated.setValue — synchronous, no re-render, same technique
    // PostcardFramedPhotoSlot already uses for its own gesture-driven visuals). This is what
    // makes the pin visually track its real coordinate as the native map is panned/zoomed,
    // without us ever issuing commands into the map ourselves (that's what caused the crash).
    const pinOffsetAnim = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;

    // The starting region: the user's saved choice if this postcard already has one, otherwise
    // centered on the entry's coordinate (or the world default). Computed once at mount — the
    // map is native-driven (scrollEnabled/zoomEnabled) from here on, not a controlled prop.
    const initialRegion: MapRegion = useMemo(() => {
      const saved = parseMapRegion(templateData);
      if (saved) return saved;
      return hasCoords ? { latitude: entry!.latitude!, longitude: entry!.longitude!, ...LOCAL_DELTA } : WORLD_REGION;
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const onContainerLayout = useCallback((e: LayoutChangeEvent) => {
      const { width, height } = e.nativeEvent.layout;
      containerSizeRef.current = { width, height };
      // Resolve the pin's starting position now that we know the container size — matters when
      // reopening a postcard whose saved region isn't already centered on the entry.
      if (hasCoords && width > 0 && height > 0) {
        const offset = pinOffsetForRegion(entry!.latitude!, entry!.longitude!, initialRegion, width, height);
        pinOffsetAnim.setValue(offset);
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Lazy-load react-native-maps — cannot be statically required in this project (Expo Go).
    // Same pattern as MapView.tsx / InteractiveMap.tsx / T5MapSnapshot.tsx.
    const [MapViewComp, setMapViewComp] = useState<any>(null);
    const [mapReady, setMapReady] = useState(false);
    const mapRef = useRef<any>(null);

    useEffect(() => {
      import('react-native-maps')
        .then((mod) => {
          setMapViewComp(() => mod.default);
          setMapReady(true);
        })
        .catch(() => setMapReady(false));
    }, []);

    const commitRegion = useCallback(
      (region: MapRegion) => {
        onTemplateDataChange?.({ ...templateData, mapRegion: region });
      },
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [templateData]
    );

    // A *new* photo/entry was picked after mount — recenter fresh rather than carrying over
    // whatever region the previous photo's map happened to be panned/zoomed to.
    const prevEntryIdRef = useRef<string | null | undefined>(undefined);
    useEffect(() => {
      const isFirst = prevEntryIdRef.current === undefined;
      const changed = prevEntryIdRef.current !== (entry?.id ?? null);
      prevEntryIdRef.current = entry?.id ?? null;
      if (isFirst || !changed) return;
      const fresh: MapRegion = hasCoords
        ? { latitude: entry!.latitude!, longitude: entry!.longitude!, ...LOCAL_DELTA }
        : WORLD_REGION;
      mapRef.current?.animateToRegion?.(fresh, 600);
      commitRegion(fresh);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [entry?.id]);

    // Fires continuously while the map is panning/zooming (user gesture *or* one of our own
    // animateToRegion calls — cause doesn't matter here, we just mirror whatever the map is
    // currently showing onto the pin's screen position). Cheap: no native command is issued,
    // this only reads the event and does a synchronous Animated.setValue.
    const handleRegionChange = useCallback(
      (region: MapRegion) => {
        if (!hasCoords) return;
        const { width, height } = containerSizeRef.current;
        if (width <= 0 || height <= 0) return;
        const offset = pinOffsetForRegion(entry!.latitude!, entry!.longitude!, region, width, height);
        pinOffsetAnim.setValue(offset);
      },
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [hasCoords, entry]
    );

    // Native pan/pinch report their settled result here. Gated on `details.isGesture` (true only
    // for a real user gesture, never for the echo of our own animateToRegion calls below) so this
    // can't turn into a feedback loop. Runs once per gesture, not per frame — the map itself does
    // all the actual panning/zooming natively; this only does a cheap bounds check afterward and,
    // rarely, a single corrective snap back into the safe zone.
    const handleRegionChangeComplete = useCallback(
      (region: MapRegion, details?: { isGesture?: boolean }) => {
        if (!interactive || !details?.isGesture) return;
        const { width, height } = containerSizeRef.current;
        if (hasCoords && width > 0 && height > 0) {
          const offset = pinOffsetForRegion(entry!.latitude!, entry!.longitude!, region, width, height);
          const maxX = width * SAFE_FRACTION;
          const maxY = height * SAFE_FRACTION;
          const cx = clamp(offset.x, maxX);
          const cy = clamp(offset.y, maxY);
          if (cx !== offset.x || cy !== offset.y) {
            const corrected = regionForPinOffset(
              entry!.latitude!, entry!.longitude!, cx, cy, width, height,
              region.latitudeDelta, region.longitudeDelta
            );
            mapRef.current?.animateToRegion?.(corrected, 250);
            commitRegion(corrected);
            return;
          }
        }
        commitRegion(region);
      },
      [interactive, hasCoords, entry, commitRegion]
    );

    const cardIconSize = Math.max(16, Math.round(28 * clampedScale));
    const chromeSize = Math.max(12, Math.round(20 * clampedScale));

    // The empty "tap to add" placeholder is a larger, inviting target; once a real photo is
    // pinned it shrinks toward that size (0.7x, then 0.5x, now nudged back up slightly per
    // feedback — 0.35x read as too small) so it still reads as a map pin/marker, not a card.
    const FILLED_SIZE_FACTOR = 0.45;
    const sizeFactor = slot0.photoUri ? FILLED_SIZE_FACTOR : 1;
    const pinWidthPct = `${(58 * sizeFactor).toFixed(1)}%` as `${number}%`;

    return (
      <View ref={ref} collapsable={false} style={[st.container, { aspectRatio }]} onLayout={onContainerLayout}>
        {mapReady && MapViewComp ? (
          <MapViewComp
            ref={mapRef}
            style={StyleSheet.absoluteFill}
            initialRegion={initialRegion}
            mapType="standard"
            scrollEnabled={interactive}
            zoomEnabled={interactive}
            rotateEnabled={false}
            pitchEnabled={false}
            onRegionChange={handleRegionChange}
            onRegionChangeComplete={handleRegionChangeComplete}
          />
        ) : (
          <LinearGradient colors={['#2C2C2E', '#1A1A1C']} style={StyleSheet.absoluteFill} />
        )}

        {/* Pin card — tracks its real coordinate as the map is panned/zoomed (see
            handleRegionChange above), the way a normal map pin would. */}
        <View style={st.centerLayer} pointerEvents="box-none">
          <Animated.View
            style={[
              st.pinWrapper,
              {
                width: pinWidthPct,
                aspectRatio: 4 / 5,
                borderRadius: s(12 * sizeFactor),
                borderWidth: s(4 * sizeFactor),
                shadowRadius: s(10 * sizeFactor),
                shadowOffset: { width: 0, height: s(4 * sizeFactor) },
                transform: pinOffsetAnim.getTranslateTransform(),
              },
            ]}
          >
            <View style={[st.pinClip, { borderRadius: s(8 * sizeFactor) }]}>
              {slot0.photoUri ? (
                <>
                  {previewMode ? (
                    <Image source={{ uri: slot0.photoUri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                  ) : (
                    <PostcardFramedPhotoSlot
                      uri={slot0.photoUri}
                      transform={slot0.transform}
                      onTransformChange={(t) => onTransformChange?.(0, t)}
                      resetKey={slot0.resetKey}
                      interactionEnabled={!previewMode}
                    />
                  )}
                  {!previewMode && !editingChromeSuppressed && (
                    <View style={st.chrome} pointerEvents="box-none">
                      <TouchableOpacity
                        style={[st.chromeBtn, { width: s(28), height: s(28), borderRadius: s(14) }]}
                        onPress={() => onResetSlotFraming?.(0)}
                        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                        accessibilityRole="button"
                        accessibilityLabel="Reset photo framing"
                      >
                        <Ionicons name="refresh-outline" size={chromeSize} color="rgba(255,255,255,0.92)" />
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[st.chromeBtn, { width: s(28), height: s(28), borderRadius: s(14) }]}
                        onPress={() => onSlotPress?.(0)}
                        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                        accessibilityRole="button"
                        accessibilityLabel="Change photo"
                      >
                        <Ionicons name="images-outline" size={chromeSize} color="rgba(255,255,255,0.92)" />
                      </TouchableOpacity>
                    </View>
                  )}
                </>
              ) : (
                <TouchableOpacity
                  style={st.emptyPin}
                  onPress={() => !previewMode && onSlotPress?.(0)}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel="Add photo"
                >
                  <Ionicons name="image-outline" size={cardIconSize} color="#666" />
                  {!previewMode && <AppText style={{ color: '#666', fontSize: s(11), marginTop: s(4) }}>Tap to add photo</AppText>}
                </TouchableOpacity>
              )}
            </View>

            {/* Pointer tail: a rotated square tucked half-behind the card's bottom edge. */}
            <View
              style={[
                st.tail,
                {
                  width: s(16 * sizeFactor),
                  height: s(16 * sizeFactor),
                  borderRadius: s(3 * sizeFactor),
                  borderWidth: s(4 * sizeFactor),
                  bottom: -s(10 * sizeFactor),
                },
              ]}
              pointerEvents="none"
            />
          </Animated.View>
        </View>
      </View>
    );
  }
);

T12MapPinTemplate.displayName = 'T12MapPinTemplate';

export default T12MapPinTemplate;

const st = StyleSheet.create({
  container: {
    backgroundColor: '#000',
    overflow: 'hidden',
    position: 'relative',
  },
  centerLayer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 5,
  },
  pinWrapper: {
    backgroundColor: '#fff',
    borderColor: '#fff',
    shadowColor: '#000',
    shadowOpacity: 0.35,
    elevation: 8,
  },
  pinClip: {
    flex: 1,
    overflow: 'hidden',
    backgroundColor: '#1a1a1a',
    position: 'relative',
  },
  emptyPin: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chrome: {
    position: 'absolute',
    top: 4,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 6,
    zIndex: 10,
  },
  chromeBtn: {
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tail: {
    position: 'absolute',
    alignSelf: 'center',
    backgroundColor: '#fff',
    borderColor: '#fff',
    transform: [{ rotate: '45deg' }],
    zIndex: 4,
  },
});
