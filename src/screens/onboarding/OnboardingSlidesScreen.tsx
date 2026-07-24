// OnboardingSlidesScreen — 4 intro slides
// Horizontal paged FlatList. Each slide has its own layered gradient background
// so the palette shifts per slide (blue → gold → green → plum). GrainOverlay sits on top
// of everything for visual texture matching the app opening aesthetic.
//
// Each slide also carries a graphic "visual" (upper ~52% of the slide) that mirrors the
// landing page's "How it works" collage style. Slide 1 uses real trip photos (bundled from
// assets/onboarding/camera-roll/) scrolling in columns. Slide 2 uses real trip photos
// (bundled from assets/onboarding/organized/), grouped into destination sets that auto-slide
// left. Slides 3 and 4 both use the shared PeekCarousel (postcards / moment cards).

import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  Image,
  Animated,
  Easing,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  useWindowDimensions,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { RootStackParamList } from '../../navigation/types';
import { COLORS, FONTS, FONT_WEIGHTS, SPACING } from '../../config/constants';
import { useReduceMotion } from '../../hooks/useReduceMotion';
import GrainOverlay from '../../components/common/GrainOverlay';

type NavProp = NativeStackNavigationProp<RootStackParamList>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const hex = (color: string, alpha: number) => {
  const r = parseInt(color.slice(1, 3), 16);
  const g = parseInt(color.slice(3, 5), 16);
  const b = parseInt(color.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
};

// ---------------------------------------------------------------------------
// Per-slide background config
// Each slide gets a dark base + two accent blobs + a bottom legibility scrim.
// ---------------------------------------------------------------------------

interface SlideTheme {
  base: string;
  blob1Color: string;
  blob1Alpha: number;
  blob1Start: { x: number; y: number };
  blob1End: { x: number; y: number };
  blob2Color: string;
  blob2Alpha: number;
  blob2Start: { x: number; y: number };
  blob2End: { x: number; y: number };
}

const SLIDE_THEMES: SlideTheme[] = [
  // Slide 1 — Blue/sky (expansive, horizon feeling)
  {
    base: '#0A141A',
    blob1Color: COLORS.babyBlue,
    blob1Alpha: 0.48,
    blob1Start: { x: 0, y: 0 },
    blob1End: { x: 0.75, y: 0.65 },
    blob2Color: COLORS.fern,
    blob2Alpha: 0.28,
    blob2Start: { x: 1, y: 0.5 },
    blob2End: { x: 0.2, y: 1 },
  },
  // Slide 2 — Fern/green (grounded, organizing)
  {
    base: '#060B0D',
    blob1Color: COLORS.fern,
    blob1Alpha: 0.3,
    blob1Start: { x: 0.5, y: 0 },
    blob1End: { x: 0.5, y: 0.65 },
    blob2Color: COLORS.babyBlue,
    blob2Alpha: 0.4,
    blob2Start: { x: 0.5, y: 0.2 },
    blob2End: { x: 0.5, y: 1 },
  },
  // Slide 3 — Gold/amber (warm, active — recap & share)
  {
    base: '#150F07',
    blob1Color: COLORS.royalGold,
    blob1Alpha: 0.44,
    blob1Start: { x: 1, y: 0 },
    blob1End: { x: 0.1, y: 0.75 },
    blob2Color: COLORS.babyBlue,
    blob2Alpha: 0.24,
    blob2Start: { x: 0, y: 0.6 },
    blob2End: { x: 0.7, y: 1 },
  },
  // Slide 4 — Plum/wine (intimate, emotional payoff)
  {
    base: '#120A10',
    blob1Color: COLORS.royalGold,
    blob1Alpha: 0.34,
    blob1Start: { x: 0, y: 0.1 },
    blob1End: { x: 0.8, y: 0.6 },
    blob2Color: COLORS.babyBlue,
    blob2Alpha: 0.28,
    blob2Start: { x: 1, y: 0.9 },
    blob2End: { x: 0.2, y: 0.2 },
  },
];

const SlideBackground: React.FC<{ theme: SlideTheme }> = ({ theme }) => (
  <>
    <View style={[StyleSheet.absoluteFillObject, { backgroundColor: theme.base }]} />
    <LinearGradient
      colors={[hex(theme.blob1Color, theme.blob1Alpha), 'transparent']}
      start={theme.blob1Start}
      end={theme.blob1End}
      style={StyleSheet.absoluteFillObject}
    />
    <LinearGradient
      colors={['transparent', hex(theme.blob2Color, theme.blob2Alpha)]}
      start={theme.blob2Start}
      end={theme.blob2End}
      style={StyleSheet.absoluteFillObject}
    />
    {/* Bottom scrim — ensures white text is always legible over the visual + gradient */}
    <LinearGradient
      colors={['transparent', 'rgba(0,0,0,0.6)']}
      start={{ x: 0.5, y: 0.32 }}
      end={{ x: 0.5, y: 1 }}
      style={StyleSheet.absoluteFillObject}
    />
  </>
);

// ---------------------------------------------------------------------------
// Slide 1 visual — scrolling photo columns ("messy camera roll")
// Real trip photos, bundled from assets/onboarding/camera-roll/. Several columns
// auto-scroll at a slow ambient pace (alternating direction) inside the slide's
// visual area, fading into the slide background at the top/bottom edges.
// ---------------------------------------------------------------------------

const MESSY_PHOTOS = [
  require('../../../assets/onboarding/camera-roll/photo-01.jpg'),
  require('../../../assets/onboarding/camera-roll/photo-02.jpg'),
  require('../../../assets/onboarding/camera-roll/photo-03.jpg'),
  require('../../../assets/onboarding/camera-roll/photo-04.jpg'),
  require('../../../assets/onboarding/camera-roll/photo-05.jpg'),
  require('../../../assets/onboarding/camera-roll/photo-06.jpg'),
  require('../../../assets/onboarding/camera-roll/photo-07.jpg'),
  require('../../../assets/onboarding/camera-roll/photo-08.jpg'),
  require('../../../assets/onboarding/camera-roll/photo-09.jpg'),
  require('../../../assets/onboarding/camera-roll/photo-10.jpg'),
  require('../../../assets/onboarding/camera-roll/photo-11.jpg'),
  require('../../../assets/onboarding/camera-roll/photo-12.jpg'),
  require('../../../assets/onboarding/camera-roll/photo-13.jpg'),
  require('../../../assets/onboarding/camera-roll/photo-14.jpg'),
  require('../../../assets/onboarding/camera-roll/photo-15.jpg'),
  require('../../../assets/onboarding/camera-roll/photo-16.jpg'),
  require('../../../assets/onboarding/camera-roll/photo-17.jpg'),
];

const PHOTO_COLUMNS = 4;
const PHOTO_GAP = 8;
const PHOTO_TILE_ASPECT = 0.78; // width / height, matches the source photos' portrait crop
const PHOTO_SCROLL_SPEED = 13; // px/sec — slow, ambient drift

const distributeIntoColumns = <T,>(items: T[], columns: number): T[][] => {
  const result: T[][] = Array.from({ length: columns }, () => []);
  items.forEach((item, i) => result[i % columns].push(item));
  return result;
};

const ScrollingPhotoColumn: React.FC<{
  photos: any[];
  columnWidth: number;
  tileHeight: number;
  direction: 'up' | 'down';
  animate: boolean;
}> = ({ photos, columnWidth, tileHeight, direction, animate }) => {
  const translateY = useRef(new Animated.Value(0)).current;
  const setHeight = photos.length * (tileHeight + PHOTO_GAP);

  useEffect(() => {
    if (!animate || setHeight <= 0) return undefined;
    const duration = (setHeight / PHOTO_SCROLL_SPEED) * 1000;
    translateY.setValue(direction === 'up' ? 0 : -setHeight);
    const loop = Animated.loop(
      Animated.timing(translateY, {
        toValue: direction === 'up' ? -setHeight : 0,
        duration,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [animate, direction, setHeight, translateY]);

  // Two back-to-back copies of the same set — when translateY completes one full
  // set's height, the loop resets to 0 at a visually identical frame (seamless wrap).
  const renderSet = (keyPrefix: string) =>
    photos.map((photo, i) => (
      <Image
        key={`${keyPrefix}-${i}`}
        source={photo}
        style={{ width: columnWidth, height: tileHeight, borderRadius: 14, marginBottom: PHOTO_GAP }}
        resizeMode="cover"
      />
    ));

  return (
    <Animated.View style={{ width: columnWidth, transform: [{ translateY }] }}>
      {renderSet('a')}
      {renderSet('b')}
    </Animated.View>
  );
};

const MessyGridVisual: React.FC = () => {
  const reduceMotion = useReduceMotion();
  const [size, setSize] = useState({ width: 0, height: 0 });

  const handleLayout = useCallback((e: any) => {
    const { width, height } = e.nativeEvent.layout;
    setSize((prev) => (prev.width === width && prev.height === height ? prev : { width, height }));
  }, []);

  const columnWidth =
    size.width > 0 ? (size.width - PHOTO_GAP * (PHOTO_COLUMNS - 1)) / PHOTO_COLUMNS : 0;
  const tileHeight = columnWidth > 0 ? columnWidth / PHOTO_TILE_ASPECT : 0;
  const columns = distributeIntoColumns(MESSY_PHOTOS, PHOTO_COLUMNS);

  return (
    <View style={StyleSheet.absoluteFillObject} onLayout={handleLayout}>
      {columnWidth > 0 && (
        <View style={{ flex: 1, flexDirection: 'row', justifyContent: 'space-between', overflow: 'hidden' }}>
          {columns.map((photos, i) => (
            <ScrollingPhotoColumn
              key={i}
              photos={photos}
              columnWidth={columnWidth}
              tileHeight={tileHeight}
              direction={i % 2 === 0 ? 'up' : 'down'}
              animate={!reduceMotion}
            />
          ))}
        </View>
      )}

      {/* Fade the columns into the slide background at the top/bottom edges of their safe space.
          Built from a flat solid block plus a plain 2-stop gradient rather than a single gradient
          with `locations` — multi-stop `locations` rendered as a no-op in this expo-linear-gradient
          version, silently producing no fade at all. This layered approach is what actually paints:
          the solid block fully covers the status bar/Skip button zone, then the gradient eases the
          photos in — a continuous cross-fade with no competing gradient/box-edge to seam against. */}
      <View style={mStyles.fadeTopSolid} pointerEvents="none" />
      <LinearGradient
        colors={[SLIDE_THEMES[0].base, 'transparent']}
        style={mStyles.fadeTopGradient}
        pointerEvents="none"
      />
      <LinearGradient
        colors={['transparent', SLIDE_THEMES[0].base]}
        style={mStyles.fadeBottomGradient}
        pointerEvents="none"
      />
      <View style={mStyles.fadeBottomSolid} pointerEvents="none" />
    </View>
  );
};

const mStyles = StyleSheet.create({
  // No overall scrim — photos should read at their true color in the clear band between
  // the top and bottom fades; only the fades themselves should darken anything.
  fadeTopSolid: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '10%',
    backgroundColor: SLIDE_THEMES[0].base,
  },
  fadeTopGradient: {
    position: 'absolute',
    top: '10%',
    left: 0,
    right: 0,
    height: '12%',
  },
  fadeBottomGradient: {
    position: 'absolute',
    bottom: '48%',
    left: 0,
    right: 0,
    height: '12%',
  },
  fadeBottomSolid: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    // Tall enough that it's fully solid well above where the headline/body text starts
    // (text is bottom-anchored above the controls) — no photo texture should ever show
    // through behind the text.
    height: '48%',
    backgroundColor: SLIDE_THEMES[0].base,
  },
});

// ---------------------------------------------------------------------------
// Slide 2 visual — organized photo sets (real trip photos, bundled from
// assets/onboarding/organized/). Grouped into 5 destination sets of 3 photos
// (1 central + 2 secondary peeking from behind), auto-advancing left every
// few seconds. Secondary photos are mostly occluded by the central card, so
// each carries a focalX/focalY bias pointing the crop at whichever edge stays
// exposed (left tile → subject near its left edge; right tile → right edge).
// ---------------------------------------------------------------------------

interface FocalPhoto {
  source: any;
  aspect: number; // source width / height
  focalX?: number; // 0-1, default 0.5 (center)
  focalY?: number; // 0-1, default 0.5 (center)
}

interface OrganizedSet {
  key: string;
  caption: string;
  flag: string;
  country: string;
  /** Sample month/year shown top-left of the central card, e.g. "March 2025" — varied per
   * set (rather than sequential) so the group reads like real, scattered trip dates. */
  dateLabel: string;
  central: FocalPhoto;
  secondaryLeft: FocalPhoto;
  secondaryRight: FocalPhoto;
}

const ORGANIZED_SETS: OrganizedSet[] = [
  {
    key: 'mexico',
    caption: 'Tacos in Mexico City',
    flag: '🇲🇽',
    country: 'Mexico',
    dateLabel: 'March 2025',
    central: { source: require('../../../assets/onboarding/organized/mexico-central.jpg'), aspect: 1176 / 1342, focalY: 0.5 },
    secondaryLeft: { source: require('../../../assets/onboarding/organized/mexico-secondary-1.jpg'), aspect: 1192 / 1376, focalY: 0.42 },
    secondaryRight: { source: require('../../../assets/onboarding/organized/mexico-secondary-2.jpg'), aspect: 1080 / 1384, focalX: 0.6, focalY: 0.55 },
  },
  {
    key: 'usa',
    caption: 'Exploring NYC',
    flag: '🇺🇸',
    country: 'United States',
    dateLabel: 'November 2024',
    central: { source: require('../../../assets/onboarding/organized/usa-central.jpg'), aspect: 1098 / 1196, focalY: 0.58 },
    secondaryLeft: { source: require('../../../assets/onboarding/organized/usa-secondary-2.jpg'), aspect: 1064 / 1448, focalX: 0.4, focalY: 0.62 },
    secondaryRight: { source: require('../../../assets/onboarding/organized/usa-secondary-1.jpg'), aspect: 1174 / 1488, focalX: 0.62, focalY: 0.6 },
  },
  {
    key: 'indonesia',
    caption: 'Hiking in Bali',
    flag: '🇮🇩',
    country: 'Indonesia',
    dateLabel: 'June 2026',
    central: { source: require('../../../assets/onboarding/organized/indonesia-central.jpg'), aspect: 1180 / 1474, focalY: 0.6 },
    secondaryLeft: { source: require('../../../assets/onboarding/organized/indonesia-secondary-2.jpg'), aspect: 916 / 1216, focalX: 0.35, focalY: 0.45 },
    secondaryRight: { source: require('../../../assets/onboarding/organized/indonesia-secondary-1.jpg'), aspect: 1126 / 1476, focalY: 0.78 },
  },
  {
    key: 'spain',
    caption: 'Food tour in Madrid',
    flag: '🇪🇸',
    country: 'Spain',
    dateLabel: 'September 2024',
    central: { source: require('../../../assets/onboarding/organized/spain-central.jpg'), aspect: 1166 / 1424, focalY: 0.55 },
    secondaryLeft: { source: require('../../../assets/onboarding/organized/spain-secondary-2.jpg'), aspect: 912 / 1280, focalY: 0.52 },
    secondaryRight: { source: require('../../../assets/onboarding/organized/spain-secondary-1.jpg'), aspect: 1182 / 1514, focalY: 0.62 },
  },
  {
    key: 'egypt',
    caption: 'Cruising the Nile',
    flag: '🇪🇬',
    country: 'Egypt',
    dateLabel: 'April 2026',
    central: { source: require('../../../assets/onboarding/organized/egypt-central.jpg'), aspect: 1074 / 1474, focalY: 0.55 },
    secondaryLeft: { source: require('../../../assets/onboarding/organized/egypt-secondary-2.jpg'), aspect: 1098 / 1352, focalY: 0.5 },
    secondaryRight: { source: require('../../../assets/onboarding/organized/egypt-secondary-1.jpg'), aspect: 1120 / 1444, focalX: 0.62, focalY: 0.8 },
  },
];

const ORGANIZED_SET_WIDTH = 345;
const ORGANIZED_SET_HEIGHT = 322;
const ORGANIZED_HOLD_MS = 3600;
const ORGANIZED_SLIDE_MS = 650;

// Renders `source` cropped to exactly fill `style`'s width/height, biased toward
// (focalX, focalY) instead of RN's default center-crop — the classic "art-directed
// crop" trick: render the image at its true cover-fit size (which may exceed the
// frame) absolutely positioned, then shift it so the focal point lands in-frame.
const FocusedImage: React.FC<{
  photo: FocalPhoto;
  width: number;
  height: number;
  style?: any;
}> = ({ photo, width, height, style }) => {
  const frameAspect = width / height;
  const imgWidth = photo.aspect > frameAspect ? height * photo.aspect : width;
  const imgHeight = photo.aspect > frameAspect ? height : width / photo.aspect;
  const left = -(imgWidth - width) * (photo.focalX ?? 0.5);
  const top = -(imgHeight - height) * (photo.focalY ?? 0.5);

  return (
    <View style={[{ width, height, overflow: 'hidden' }, style]}>
      <Image source={photo.source} style={{ position: 'absolute', width: imgWidth, height: imgHeight, left, top }} resizeMode="cover" />
    </View>
  );
};

const SECONDARY_TILE_WIDTH = 172;
const SECONDARY_TILE_HEIGHT = 230;
const CENTRAL_CARD_WIDTH = 218;
const CENTRAL_CARD_HEIGHT = 291;

const OrganizedSetComposition: React.FC<{ set: OrganizedSet }> = ({ set }) => (
  <View style={{ width: ORGANIZED_SET_WIDTH, height: ORGANIZED_SET_HEIGHT, alignItems: 'center', justifyContent: 'center' }}>
    <FocusedImage
      photo={set.secondaryLeft}
      width={SECONDARY_TILE_WIDTH}
      height={SECONDARY_TILE_HEIGHT}
      style={{
        position: 'absolute',
        top: 15,
        left: 17,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.16)',
        transform: [{ rotate: '-9deg' }],
      }}
    />
    <FocusedImage
      photo={set.secondaryRight}
      width={SECONDARY_TILE_WIDTH}
      height={SECONDARY_TILE_HEIGHT}
      style={{
        position: 'absolute',
        top: 20,
        right: 10,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.16)',
        transform: [{ rotate: '8deg' }],
      }}
    />
    <View style={{ position: 'absolute', width: CENTRAL_CARD_WIDTH, height: CENTRAL_CARD_HEIGHT, borderRadius: 18, overflow: 'hidden' }}>
      <FocusedImage photo={set.central} width={CENTRAL_CARD_WIDTH} height={CENTRAL_CARD_HEIGHT} />
      <LinearGradient
        colors={['rgba(0,0,0,0.5)', 'transparent']}
        style={{ position: 'absolute', left: 0, right: 0, top: 0, height: '34%' }}
        pointerEvents="none"
      />
      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.68)']}
        style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: '45%' }}
        pointerEvents="none"
      />
      <View style={oStyles.topLeft} pointerEvents="none">
        <Text style={oStyles.countryLine} numberOfLines={1}>
          {set.flag} {set.country}
        </Text>
        <Text style={oStyles.dateLine} numberOfLines={1}>
          {set.dateLabel}
        </Text>
      </View>
      <Text style={oStyles.caption} numberOfLines={2}>
        {set.caption}
      </Text>
    </View>
  </View>
);

const oStyles = StyleSheet.create({
  topLeft: {
    position: 'absolute',
    top: 14,
    left: 16,
    right: 16,
  },
  countryLine: {
    color: '#FFFFFF',
    fontFamily: FONTS.inter,
    fontSize: 16,
    fontWeight: FONT_WEIGHTS.bold as any,
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  dateLine: {
    marginTop: 2,
    color: 'rgba(255,255,255,0.85)',
    fontFamily: FONTS.inter,
    fontSize: 12,
    fontWeight: FONT_WEIGHTS.semibold as any,
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  caption: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 16,
    color: '#FFFFFF',
    fontFamily: FONTS.inter,
    fontSize: 18,
    fontWeight: FONT_WEIGHTS.bold as any,
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
});

// Every set gets its own permanent Animated.Value ("presence": 0 = hidden, 1 = shown) and its
// own permanently-bound OrganizedSetComposition — nothing ever swaps which photos a layer
// displays. Advancing the carousel just animates the current set's presence down to 0 and the
// next set's presence up to 1 in parallel. This replaces an earlier version that reused two
// "slots" (current/next) and reassigned which set's data each slot displayed every cycle: that
// reassignment (a JS-side prop/state update) and the native-driven animated-value reset were
// two independent native-bridge operations with no guaranteed ordering, so the fix — timing the
// reset with a layout effect — closed the JS-side race but not this native one, and the old
// set could still flash back at full opacity for a frame. With a stable value-per-set, there is
// no reassignment left to race against.
const OrganizedCardsVisual: React.FC<{ isActive: boolean }> = ({ isActive }) => {
  const reduceMotion = useReduceMotion();
  // All start hidden — the first set is revealed with its own entrance animation once the
  // slide actually becomes active, rather than already sitting on screen when the user swipes
  // to it (see the `hasStarted` effect below).
  const presences = useRef(ORGANIZED_SETS.map(() => new Animated.Value(0))).current;
  const activeRef = useRef(0);
  const [hasStarted, setHasStarted] = useState(false);

  // Flips once, the first time this slide becomes active. Deliberately separate from the loop
  // effect below: the loop must keep running even if the user swipes away and back later, so it
  // can't depend on `isActive` directly (that would tear the loop down and — since this effect
  // only ever fires once — never restart it on a later visit).
  useEffect(() => {
    if (isActive && !hasStarted) setHasStarted(true);
  }, [isActive, hasStarted]);

  useEffect(() => {
    if (reduceMotion) {
      presences[0].setValue(1);
      return undefined;
    }
    if (!hasStarted) return undefined;
    let cancelled = false;
    const total = ORGANIZED_SETS.length;

    const step = () => {
      if (cancelled) return;
      const current = activeRef.current;
      const next = (current + 1) % total;
      Animated.sequence([
        Animated.delay(ORGANIZED_HOLD_MS),
        Animated.parallel([
          Animated.timing(presences[current], {
            toValue: 0,
            duration: ORGANIZED_SLIDE_MS,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.timing(presences[next], {
            toValue: 1,
            duration: ORGANIZED_SLIDE_MS,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
        ]),
      ]).start(({ finished }) => {
        if (!finished || cancelled) return;
        activeRef.current = next;
        step();
      });
    };

    // Entrance: reveal the first set now that the slide is actually visible, then fall
    // straight into the normal hold/advance loop.
    Animated.timing(presences[0], {
      toValue: 1,
      duration: ORGANIZED_SLIDE_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (!finished || cancelled) return;
      step();
    });

    return () => {
      cancelled = true;
      presences.forEach((p) => p.stopAnimation());
    };
  }, [hasStarted, reduceMotion, presences]);

  return (
    <View style={{ width: ORGANIZED_SET_WIDTH, height: ORGANIZED_SET_HEIGHT }}>
      {ORGANIZED_SETS.map((set, i) => (
        <Animated.View
          key={set.key}
          style={[
            StyleSheet.absoluteFillObject,
            {
              opacity: presences[i],
              transform: [{ scale: presences[i].interpolate({ inputRange: [0, 1], outputRange: [0.97, 1] }) }],
            },
          ]}
          pointerEvents="none"
        >
          <OrganizedSetComposition set={set} />
        </Animated.View>
      ))}
    </View>
  );
};

// ---------------------------------------------------------------------------
// Shared "peek carousel" — a row of cards where the current one is centered full-size and its
// neighbors peek in from the screen edges (cut off by the viewport, not by their own frame).
// Steps by one card width at a time: slide to center the next card, pause, slide again. Used by
// both slide 3 (postcards) and slide 4 (moment cards). With a single card, it just sits still.
// ---------------------------------------------------------------------------

interface PeekCard {
  source: any;
  rotate?: string;
  caption?: string;
}

const PEEK_HOLD_MS = 3200;
const PEEK_SLIDE_MS = 600;
const PEEK_GAP = 16;

const PeekCarousel: React.FC<{ cards: PeekCard[]; cardWidthRatio: number; aspect: number }> = ({
  cards,
  cardWidthRatio,
  aspect,
}) => {
  const reduceMotion = useReduceMotion();
  const { width } = useWindowDimensions();
  const cardWidth = width * cardWidthRatio;
  const cardHeight = cardWidth / aspect;
  const step = cardWidth + PEEK_GAP;
  const sidePad = (width - cardWidth) / 2;
  const total = cards.length;
  // Prepend the last card and append the first, so a left/center/right neighbor is always
  // visible — including on the very first paint, not just once the loop wraps around.
  const loopCards = total > 1 ? [cards[total - 1], ...cards, cards[0]] : cards;
  const startIndex = total > 1 ? 1 : 0;
  const translateX = useRef(new Animated.Value(-step * startIndex)).current;
  const indexRef = useRef(startIndex);

  useEffect(() => {
    if (reduceMotion || total <= 1) return undefined;
    let cancelled = false;

    const run = () => {
      if (cancelled) return;
      Animated.sequence([
        Animated.delay(PEEK_HOLD_MS),
        Animated.timing(translateX, {
          toValue: -step * (indexRef.current + 1),
          duration: PEEK_SLIDE_MS,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]).start(({ finished }) => {
        if (!finished || cancelled) return;
        indexRef.current += 1;
        if (indexRef.current === total + 1) {
          indexRef.current = 1;
          translateX.setValue(-step * 1);
        }
        run();
      });
    };

    run();
    return () => {
      cancelled = true;
      translateX.stopAnimation();
    };
  }, [reduceMotion, translateX, step, total]);

  return (
    <View style={{ width, height: cardHeight + 24, overflow: 'hidden' }}>
      <Animated.View
        style={{ flexDirection: 'row', paddingLeft: sidePad, paddingTop: 24, transform: [{ translateX }] }}
      >
        {loopCards.map((card, i) => (
          <View key={i} style={{ width: cardWidth, marginRight: PEEK_GAP, transform: [{ rotate: card.rotate ?? '0deg' }] }}>
            <View style={{ width: cardWidth, height: cardHeight, borderRadius: 22, overflow: 'hidden' }}>
              <Image source={card.source} style={{ width: cardWidth, height: cardHeight }} resizeMode="cover" />
            </View>
            {card.caption ? (
              <View style={peekStyles.captionPill}>
                <Text style={peekStyles.captionText}>{card.caption}</Text>
              </View>
            ) : null}
          </View>
        ))}
      </Animated.View>
    </View>
  );
};

const peekStyles = StyleSheet.create({
  captionPill: {
    position: 'absolute',
    top: -14,
    left: 14,
    maxWidth: 280,
    backgroundColor: 'rgba(255,255,255,0.94)',
    borderRadius: 100,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  captionText: {
    fontFamily: FONTS.inter,
    fontSize: 13,
    fontWeight: FONT_WEIGHTS.semibold as any,
    color: '#111111',
  },
});

// ---------------------------------------------------------------------------
// Slide 3 visual — real postcard designs (bundled from assets/onboarding/postcards/)
// ---------------------------------------------------------------------------

const RECAP_CARDS: PeekCard[] = [
  { source: require('../../../assets/onboarding/postcards/card-barcelona.jpg') },
  { source: require('../../../assets/onboarding/postcards/card-mexico.jpg') },
  { source: require('../../../assets/onboarding/postcards/card-shanghai.jpg') },
  { source: require('../../../assets/onboarding/postcards/card-berlin.jpg') },
];

const RecapShareVisual: React.FC = () => (
  <PeekCarousel cards={RECAP_CARDS} cardWidthRatio={0.576} aspect={0.8} />
);

// ---------------------------------------------------------------------------
// Slide 4 visual — moment cards (real photo + emotion-note pill caption), crossfading like
// the slide-2 carousel (permanent per-card opacity value, fade+scale). Tilt direction and
// caption corner vary per card so consecutive cards don't feel identical.
// ---------------------------------------------------------------------------

interface MomentCard {
  source: any;
  caption: string;
  rotate: string;
  captionStyle: { top?: number; bottom?: number; left?: number; right?: number };
}

const MOMENT_CARDS: MomentCard[] = [
  {
    source: require('../../../assets/onboarding/moments/moment-sunset.jpg'),
    caption: 'Felt child-like happy\nin this moment',
    rotate: '-3deg',
    captionStyle: { bottom: -14, left: 16 },
  },
  {
    source: require('../../../assets/onboarding/moments/moment-dive.jpg'),
    caption: 'Fascinated by marine creatures',
    rotate: '3deg',
    captionStyle: { top: -14, right: 16 },
  },
  {
    source: require('../../../assets/onboarding/moments/moment-art.jpg'),
    caption: 'Feeling like following\nmy passion for art',
    rotate: '-2deg',
    captionStyle: { bottom: -14, right: 16 },
  },
  {
    source: require('../../../assets/onboarding/moments/moment-lake.jpg'),
    caption: "Amazed by the lake's vastness",
    rotate: '2deg',
    captionStyle: { top: -14, left: 16 },
  },
];

const MOMENT_HOLD_MS = 3200;
const MOMENT_FADE_MS = 700;
const MOMENT_CARD_WIDTH_RATIO = 0.62;
const MOMENT_ASPECT = 0.78;

const EmotionVisual: React.FC = () => {
  const reduceMotion = useReduceMotion();
  const { width } = useWindowDimensions();
  const cardWidth = width * MOMENT_CARD_WIDTH_RATIO;
  const cardHeight = cardWidth / MOMENT_ASPECT;
  const presences = useRef(MOMENT_CARDS.map((_, i) => new Animated.Value(i === 0 ? 1 : 0))).current;
  const activeRef = useRef(0);

  useEffect(() => {
    if (reduceMotion) return undefined;
    let cancelled = false;
    const total = MOMENT_CARDS.length;

    const step = () => {
      if (cancelled) return;
      const current = activeRef.current;
      const next = (current + 1) % total;
      Animated.sequence([
        Animated.delay(MOMENT_HOLD_MS),
        Animated.parallel([
          Animated.timing(presences[current], {
            toValue: 0,
            duration: MOMENT_FADE_MS,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.timing(presences[next], {
            toValue: 1,
            duration: MOMENT_FADE_MS,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
        ]),
      ]).start(({ finished }) => {
        if (!finished || cancelled) return;
        activeRef.current = next;
        step();
      });
    };

    step();
    return () => {
      cancelled = true;
      presences.forEach((p) => p.stopAnimation());
    };
  }, [reduceMotion, presences]);

  return (
    <View style={{ width, height: cardHeight + 40, alignItems: 'center', justifyContent: 'center' }}>
      {MOMENT_CARDS.map((card, i) => (
        <Animated.View
          key={i}
          style={{
            position: 'absolute',
            width: cardWidth,
            opacity: presences[i],
            transform: [
              { rotate: card.rotate },
              { scale: presences[i].interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] }) },
            ],
          }}
        >
          <View style={{ width: cardWidth, height: cardHeight, borderRadius: 22, overflow: 'hidden' }}>
            <Image source={card.source} style={{ width: cardWidth, height: cardHeight }} resizeMode="cover" />
          </View>
          <View style={[momentStyles.captionPill, card.captionStyle]}>
            <Text style={momentStyles.captionText}>{card.caption}</Text>
          </View>
        </Animated.View>
      ))}
    </View>
  );
};

const momentStyles = StyleSheet.create({
  captionPill: {
    position: 'absolute',
    maxWidth: 280,
    backgroundColor: 'rgba(255,255,255,0.94)',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    alignItems: 'center',
  },
  captionText: {
    fontFamily: FONTS.inter,
    fontSize: 13,
    fontWeight: FONT_WEIGHTS.semibold as any,
    color: '#111111',
    textAlign: 'center',
    lineHeight: 18,
  },
});

// ---------------------------------------------------------------------------
// Slide data
// ---------------------------------------------------------------------------

interface SlideData {
  key: string;
  headline: string;
  body: string;
  theme: SlideTheme;
  /** A factory rather than a plain element so slides can react to `isActive` (e.g. the
   * organized-photos carousel waits to reveal its first set until the user has actually
   * swiped to it, instead of it already sitting there when the slide comes into view). */
  renderVisual: (isActive: boolean) => React.ReactNode;
  /** When true, the visual spans the entire slide (including behind the status bar/Skip
   * button) instead of the centered top-half box other slides use. MessyGridVisual needs this:
   * its own fade has to own the full transition from the top edge, otherwise it collides with
   * SlideBackground's gradient blob and reads as a hard line at the box's boundary. */
  fullBleedVisual?: boolean;
}

const SLIDES: SlideData[] = [
  {
    key: 'messy',
    headline: 'Hundreds of pictures... \nmany stories left untold',
    body: 'A camera roll full of moments, but no easy way to find & share the ones that mattered.',
    theme: SLIDE_THEMES[0],
    renderVisual: () => <MessyGridVisual />,
    fullBleedVisual: true,
  },
  {
    key: 'organized',
    headline: 'Memories organized, \nmoments to be relived',
    body: 'Photos, organized into trips and moments, so the memories that matter are easy to find.',
    theme: SLIDE_THEMES[1],
    renderVisual: (isActive) => <OrganizedCardsVisual isActive={isActive} />,
  },
  {
    key: 'loop',
    headline: 'Meaningful stories, \nready for sharing & reliving',
    body: 'Replay the trip through video recaps and share digital postcards with friends and family.',
    theme: SLIDE_THEMES[2],
    renderVisual: () => <RecapShareVisual />,
  },
  {
    key: 'payoff',
    headline: 'The story is \nmore than the photos',
    body: 'Documenting the human side of the experience makes memories complete and intentional.',
    theme: SLIDE_THEMES[3],
    renderVisual: () => <EmotionVisual />,
  },
];

// ---------------------------------------------------------------------------
// Slide item
// ---------------------------------------------------------------------------

interface SlideItemProps {
  slide: SlideData;
  width: number;
  height: number;
  topPad: number;
  bottomPad: number;
  isActive: boolean;
}

const SlideItem: React.FC<SlideItemProps> = ({ slide, width, height, topPad, bottomPad, isActive }) => {
  const visualHeight = height * 0.5;

  return (
    <View style={{ width, height, overflow: 'hidden' }}>
      <SlideBackground theme={slide.theme} />

      {slide.fullBleedVisual ? (
        <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
          {slide.renderVisual(isActive)}
        </View>
      ) : (
        <View
          style={{
            position: 'absolute',
            top: topPad,
            left: 0,
            right: 0,
            height: visualHeight,
            alignItems: 'center',
            justifyContent: 'center',
          }}
          pointerEvents="none"
        >
          {slide.renderVisual(isActive)}
        </View>
      )}

      <View
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: bottomPad,
          paddingHorizontal: SPACING.lg,
          gap: 16,
        }}
      >
        <Text style={sStyles.headline}>{slide.headline}</Text>
        {slide.body ? <Text style={sStyles.body}>{slide.body}</Text> : null}
      </View>
    </View>
  );
};

// ---------------------------------------------------------------------------
// Bottom controls height (dots + CTA + spacing, excludes safe-area bottom)
// ---------------------------------------------------------------------------

const CONTROLS_HEIGHT = 144;

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

const OnboardingSlidesScreen: React.FC = () => {
  const navigation = useNavigation<NavProp>();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReduceMotion();
  const listRef = useRef<FlatList<SlideData>>(null);
  const [currentIndex, setCurrentIndex] = useState(0);

  const topPad = insets.top + 52;
  const bottomPad = insets.bottom + CONTROLS_HEIGHT + 24;

  const goToSlide = useCallback(
    (index: number) => {
      listRef.current?.scrollToIndex({ index, animated: !reduceMotion });
      setCurrentIndex(index);
    },
    [reduceMotion],
  );

  const handleNext = useCallback(() => {
    if (currentIndex < SLIDES.length - 1) {
      goToSlide(currentIndex + 1);
    } else {
      navigation.navigate('OnboardingPath');
    }
  }, [currentIndex, goToSlide, navigation]);

  const handleSkip = useCallback(() => {
    navigation.navigate('OnboardingPath');
  }, [navigation]);

  const onMomentumScrollEnd = useCallback(
    (e: any) => {
      const index = Math.round(e.nativeEvent.contentOffset.x / width);
      setCurrentIndex(index);
    },
    [width],
  );

  const getItemLayout = useCallback(
    (_: any, index: number) => ({ length: width, offset: width * index, index }),
    [width],
  );

  const isLast = currentIndex === SLIDES.length - 1;

  return (
    // Root background matches slide 1 base so there's no flash on first render
    <View style={[styles.root, { backgroundColor: SLIDE_THEMES[0].base }]}>
      {/* Slides */}
      <FlatList
        ref={listRef}
        data={SLIDES}
        keyExtractor={(item) => item.key}
        horizontal
        pagingEnabled
        bounces={false}
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={16}
        onMomentumScrollEnd={onMomentumScrollEnd}
        getItemLayout={getItemLayout}
        extraData={currentIndex}
        renderItem={({ item, index }) => (
          <SlideItem
            slide={item}
            width={width}
            height={height}
            topPad={topPad}
            bottomPad={bottomPad}
            isActive={index === currentIndex}
          />
        )}
      />

      {/* Unified grain texture over all slides */}
      <GrainOverlay />

      {/* Skip — top-right, above grain */}
      <TouchableOpacity
        style={[styles.skip, { top: insets.top + 16 }]}
        onPress={handleSkip}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel="Skip intro"
        hitSlop={{ top: 8, bottom: 8, left: 12, right: 0 }}
      >
        <Text style={styles.skipText}>Skip</Text>
      </TouchableOpacity>

      {/* Bottom controls — above grain */}
      <View style={[styles.controls, { paddingBottom: insets.bottom + 32 }]}>
        <View style={styles.dots}>
          {SLIDES.map((_, i) => (
            <TouchableOpacity
              key={i}
              onPress={() => goToSlide(i)}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              accessibilityRole="button"
              accessibilityLabel={`Go to slide ${i + 1}`}
            >
              <View style={[styles.dot, i === currentIndex ? styles.dotActive : styles.dotInactive]} />
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity
          style={styles.cta}
          onPress={handleNext}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={isLast ? 'Get started' : 'Next slide'}
        >
          <Text style={styles.ctaLabel}>{isLast ? 'Get started' : 'Next'}</Text>
          {!isLast && <Ionicons name="arrow-forward" size={16} color="#111111" />}
        </TouchableOpacity>
      </View>
    </View>
  );
};

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  skip: {
    position: 'absolute',
    right: SPACING.lg,
    zIndex: 20,
  },
  skipText: {
    fontFamily: FONTS.inter,
    fontSize: 15,
    fontWeight: FONT_WEIGHTS.regular as any,
    color: 'rgba(255,255,255,0.65)',
  },
  controls: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 20,
    paddingHorizontal: SPACING.lg,
    gap: 18,
    alignItems: 'center',
  },
  dots: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dot: {
    borderRadius: 100,
  },
  dotActive: {
    width: 20,
    height: 6,
    backgroundColor: COLORS.royalGold,
  },
  dotInactive: {
    width: 6,
    height: 6,
    backgroundColor: 'rgba(255,255,255,0.35)',
  },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 100,
    paddingVertical: 16,
    alignSelf: 'stretch',
    gap: 8,
  },
  ctaLabel: {
    fontFamily: FONTS.inter,
    fontSize: 16,
    fontWeight: FONT_WEIGHTS.semibold as any,
    color: '#111111',
  },
});

// Slide text styles
const sStyles = StyleSheet.create({
  headline: {
    fontFamily: FONTS.playfairDisplay,
    fontSize: 28,
    fontWeight: FONT_WEIGHTS.bold as any,
    lineHeight: 35,
    color: '#FFFFFF',
    letterSpacing: -0.3,
  },
  body: {
    fontFamily: FONTS.inter,
    fontSize: 15,
    fontWeight: FONT_WEIGHTS.regular as any,
    color: 'rgba(255,255,255,0.75)',
    lineHeight: 22,
  },
});


export default OnboardingSlidesScreen;
