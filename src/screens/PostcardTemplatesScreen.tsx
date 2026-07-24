import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  ScrollView,
  FlatList,
  Image,
  TouchableOpacity,
  StyleSheet,
  useWindowDimensions,
  Animated,
  Easing,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import AppText from '../components/common/AppText';
import { useTheme } from '../context/ThemeContext';
import { useAppContext } from '../context/AppContext';
import { useReduceMotion } from '../hooks/useReduceMotion';
import { Entry } from '../models/Entry';
import { RootStackParamList } from '../navigation/types';
import { FONTS, FONT_WEIGHTS, SPACING } from '../config/constants';
import { TEMPLATE_REGISTRY, type TemplateRegistryEntry } from '../config/templateRegistry';

const PILL_SLIDE_MS = 240;

type Nav = NativeStackNavigationProp<RootStackParamList>;
type TabKey = 'templates' | 'gallery';

const COLUMNS = 2;
const CARD_GAP = 12;
const GALLERY_COLUMNS = 3;
const GALLERY_CELL_GAP = 2;
/** Thin separator between cells in the Collages mockup preview only — the real editable
 *  collage templates (C01-C05 in components/postcards/templates/) render edge-to-edge. */
const MOCK_GRID_GAP = 2;

/** Sample photos used only to preview each template/collage layout in the picker. */
const MOCK_PHOTOS = {
  t01: [
    require('../../assets/postcard-mockups/t01-1-raw.jpg'),
    require('../../assets/postcard-mockups/t01-2-raw.jpg'),
    require('../../assets/postcard-mockups/t01-3-raw.jpg'),
    require('../../assets/postcard-mockups/t01-4-raw.jpg'),
  ],
  t02: [require('../../assets/postcard-mockups/t02-1-raw.jpg')],
  t04: [
    require('../../assets/postcard-mockups/t04-1-raw.png'),
    require('../../assets/postcard-mockups/t04-2-raw.jpg'),
  ],
  t03: [require('../../assets/postcard-mockups/t03-1-raw.jpg')],
  t05: [
    require('../../assets/postcard-mockups/t05-1-raw.jpg'),
    require('../../assets/postcard-mockups/t05-2-raw.jpg'),
  ],
  t06: [
    require('../../assets/postcard-mockups/t06-1-raw.jpg'),
    require('../../assets/postcard-mockups/t06-2-raw.jpg'),
    require('../../assets/postcard-mockups/t06-3-raw.jpg'),
  ],
  t07: [require('../../assets/postcard-mockups/t07-1-raw.jpg')],
  t12: [require('../../assets/postcard-mockups/t12-1-raw.png')],
  t11: [
    require('../../assets/postcard-mockups/t11-1-raw.jpg'),
    require('../../assets/postcard-mockups/t11-2-raw.jpg'),
  ],
  c01: [
    require('../../assets/postcard-mockups/c01-1-raw.jpg'),
    require('../../assets/postcard-mockups/c01-2-raw.jpg'),
  ],
  c02: [
    require('../../assets/postcard-mockups/c02-1-raw.jpg'),
    require('../../assets/postcard-mockups/c02-2-raw.jpg'),
    require('../../assets/postcard-mockups/c02-3-raw.jpg'),
  ],
  c03: [
    require('../../assets/postcard-mockups/c03-1-raw.jpg'),
    require('../../assets/postcard-mockups/c03-2-raw.jpg'),
    require('../../assets/postcard-mockups/c03-3-raw.jpg'),
    require('../../assets/postcard-mockups/c03-4-raw.jpg'),
  ],
  c04: [
    require('../../assets/postcard-mockups/c04-1-raw.jpg'),
    require('../../assets/postcard-mockups/c04-2-raw.jpg'),
    require('../../assets/postcard-mockups/c04-3-raw.jpg'),
    require('../../assets/postcard-mockups/c04-4-raw.jpg'),
    require('../../assets/postcard-mockups/c04-5-raw.jpg'),
    require('../../assets/postcard-mockups/c04-6-raw.jpg'),
  ],
  c05: [
    require('../../assets/postcard-mockups/c05-1-raw.jpg'),
    require('../../assets/postcard-mockups/c05-2-raw.jpg'),
    require('../../assets/postcard-mockups/c05-3-raw.jpg'),
  ],
} as const;

/**
 * Every dimension here is an explicit number computed by the caller — never `flex:1` on an
 * Image or a `StyleSheet.absoluteFill` Image nested inside a flex chain. That combination left
 * the actual on-screen box ambiguous in practice (single-photo cells rendered as a solid sliver
 * of sky no matter how the source crop was adjusted), so every cell's pixel size is computed
 * up front instead and handed straight to `Image` as a concrete `width`/`height`.
 */
const MockPhoto: React.FC<{ source: number; width: number; height: number }> = ({ source, width, height }) => (
  <View style={{ width, height, overflow: 'hidden', borderRadius: 3, backgroundColor: '#161616' }}>
    <Image source={source} style={{ width, height }} resizeMode="cover" />
  </View>
);

/** Template-specific preview content rendered as colored rects/shapes, or real mock photos where provided. */
const TemplatePreview: React.FC<{ templateId: string; width: number; height: number }> = ({
  templateId,
  width,
  height,
}) => {
  const darkRect = { backgroundColor: '#2a2a2a', borderRadius: 3 };

  switch (templateId) {
    case 'T-01': {
      // 2×2 photo grid with centered highlight note card (the template's signature element)
      const cellW = (width - 12 - 4) / 2;
      const cellH = (height - 12 - 4) / 2;
      return (
        <View style={{ width, height, padding: 6, gap: 4 }}>
          <View style={{ flexDirection: 'row', gap: 4 }}>
            <MockPhoto source={MOCK_PHOTOS.t01[0]} width={cellW} height={cellH} />
            <MockPhoto source={MOCK_PHOTOS.t01[1]} width={cellW} height={cellH} />
          </View>
          <View style={{ flexDirection: 'row', gap: 4 }}>
            <MockPhoto source={MOCK_PHOTOS.t01[2]} width={cellW} height={cellH} />
            <MockPhoto source={MOCK_PHOTOS.t01[3]} width={cellW} height={cellH} />
          </View>
          {/* Notecard overlay */}
          <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }} pointerEvents="none">
            <View style={{ backgroundColor: '#fff', paddingHorizontal: 10, paddingVertical: 7, borderRadius: 2, maxWidth: '78%' }}>
              <AppText style={{ fontSize: 10, lineHeight: 13, color: '#1A1A1A', textAlign: 'center' }}>
                May 9. Traveling through{' '}
                <AppText style={{ fontSize: 10, backgroundColor: '#FFE566', color: '#1A1A1A' }}>Shanghai, China</AppText>.
              </AppText>
            </View>
          </View>
        </View>
      );
    }
    case 'T-02': {
      // Full-bleed camera viewfinder chrome matching T02CameraViewfinderTemplate
      // (top HUD, corner brackets inset from chrome, labeled bottom strip).
      const scale = Math.max(0.4, Math.min(1, width / 280));
      const s = (v: number) => Math.max(1, Math.round(v * scale));
      const font = (v: number) => Math.max(6, Math.round(v * scale));
      const topBarHeight = s(36);
      const bottomStripHeight = s(52);
      const bracketLen = s(20);
      const bracketThick = Math.max(1, s(2));
      const bracketColor = 'rgba(255,255,255,0.75)';
      const inset = s(8);
      return (
        <View style={{ width, height, position: 'relative', overflow: 'hidden', backgroundColor: '#000' }}>
          <Image source={MOCK_PHOTOS.t02[0]} style={{ width, height }} resizeMode="cover" />
          {/* Top bar */}
          <View
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              height: topBarHeight,
              paddingHorizontal: s(10),
              backgroundColor: 'rgba(0,0,0,0.55)',
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
            pointerEvents="none"
          >
            <AppText style={{ fontFamily: FONTS.mono, fontSize: font(11), color: '#fff' }}>
              {'[///]  4:3  16M'}
            </AppText>
            <View
              style={{
                paddingHorizontal: s(6),
                paddingVertical: s(2),
                borderRadius: s(3),
                backgroundColor: 'rgba(255,255,255,0.15)',
              }}
            >
              <AppText style={{ fontFamily: FONTS.mono, fontSize: font(11), color: '#fff' }}>29°C</AppText>
            </View>
          </View>
          {/* Corner brackets — inset below top bar / above bottom strip */}
          <View style={{ position: 'absolute', top: topBarHeight + inset, left: inset }} pointerEvents="none">
            <View style={{ position: 'absolute', top: 0, left: 0, width: bracketLen, height: bracketThick, backgroundColor: bracketColor }} />
            <View style={{ position: 'absolute', top: 0, left: 0, width: bracketThick, height: bracketLen, backgroundColor: bracketColor }} />
          </View>
          <View style={{ position: 'absolute', top: topBarHeight + inset, right: inset }} pointerEvents="none">
            <View style={{ position: 'absolute', top: 0, right: 0, width: bracketLen, height: bracketThick, backgroundColor: bracketColor }} />
            <View style={{ position: 'absolute', top: 0, right: 0, width: bracketThick, height: bracketLen, backgroundColor: bracketColor }} />
          </View>
          <View style={{ position: 'absolute', bottom: bottomStripHeight + inset, left: inset }} pointerEvents="none">
            <View style={{ position: 'absolute', bottom: 0, left: 0, width: bracketLen, height: bracketThick, backgroundColor: bracketColor }} />
            <View style={{ position: 'absolute', bottom: 0, left: 0, width: bracketThick, height: bracketLen, backgroundColor: bracketColor }} />
          </View>
          <View style={{ position: 'absolute', bottom: bottomStripHeight + inset, right: inset }} pointerEvents="none">
            <View style={{ position: 'absolute', bottom: 0, right: 0, width: bracketLen, height: bracketThick, backgroundColor: bracketColor }} />
            <View style={{ position: 'absolute', bottom: 0, right: 0, width: bracketThick, height: bracketLen, backgroundColor: bracketColor }} />
          </View>
          {/* Bottom strip */}
          <View
            style={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
              height: bottomStripHeight,
              paddingHorizontal: s(10),
              paddingVertical: s(5),
              gap: s(2),
              backgroundColor: 'rgba(0,0,0,0.75)',
              justifyContent: 'center',
            }}
            pointerEvents="none"
          >
            <AppText style={{ fontFamily: FONTS.mono, fontSize: font(10), color: '#fff' }}>
              {'001  09 05 2024  3:42 PM'}
            </AppText>
            <AppText style={{ fontFamily: FONTS.mono, fontSize: font(11), color: '#fff' }} numberOfLines={1}>
              Puerto Escondido
            </AppText>
            <AppText style={{ fontFamily: FONTS.mono, fontSize: font(9), color: 'rgba(255,255,255,0.6)' }}>
              DOCUMENTED WITH JOURNEY ONWARD
            </AppText>
          </View>
        </View>
      );
    }
    case 'T-03': {
      // Full-bleed photo with the real template's handwritten "statement" overlay
      return (
        <View style={{ width, height, position: 'relative', overflow: 'hidden' }}>
          <Image source={MOCK_PHOTOS.t03[0]} style={{ width, height }} resizeMode="cover" />
          <View style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(0,0,0,0.18)' }} pointerEvents="none" />
          <View style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, justifyContent: 'center', paddingHorizontal: 14 }} pointerEvents="none">
            <AppText
              style={{
                fontFamily: FONTS.permanentMarker,
                fontSize: 15,
                lineHeight: 18,
                color: '#fff',
                textShadowColor: 'rgba(0,0,0,0.6)',
                textShadowOffset: { width: 1, height: 1 },
                textShadowRadius: 3,
              }}
            >
              {"IF YOU'RE\nREADING THIS\nI WAS IN\nGIZA, EGYPT"}
            </AppText>
          </View>
        </View>
      );
    }
    case 'T-04': {
      // Full-bleed background photo with a smaller foreground photo and a tilted location tag
      // hanging off its bottom-right corner — mirrors the real T04LocationTagTemplate layout.
      const fgW = width * 0.86;
      const fgH = fgW * (3 / 4);
      return (
        <View style={{ width, height, position: 'relative', overflow: 'hidden' }}>
          <Image source={MOCK_PHOTOS.t04[1]} style={{ width, height }} resizeMode="cover" />
          <View
            style={{
              position: 'absolute',
              top: height * 0.28,
              left: width * 0.07,
              width: fgW,
              height: fgH,
              borderRadius: 4,
              overflow: 'hidden',
              backgroundColor: '#161616',
              shadowColor: '#000',
              shadowOpacity: 0.35,
              shadowRadius: 6,
              shadowOffset: { width: 0, height: 3 },
              elevation: 6,
            }}
          >
            <Image source={MOCK_PHOTOS.t04[0]} style={{ width: fgW, height: fgH }} resizeMode="cover" />
          </View>
          <View
            style={{
              position: 'absolute',
              top: height * 0.28 + fgH - 10,
              right: width * 0.07 - 8,
              borderRadius: 10,
              overflow: 'hidden',
              borderWidth: StyleSheet.hairlineWidth,
              borderColor: 'rgba(255,255,255,0.22)',
              transform: [{ rotate: '-3deg' }],
            }}
            pointerEvents="none"
          >
            <BlurView intensity={36} tint="dark" style={StyleSheet.absoluteFill} />
            <View style={{ ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.12)' }} />
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 3,
                paddingHorizontal: 8,
                paddingVertical: 5,
              }}
            >
              <Ionicons name="location" size={9} color="rgba(255,255,255,0.92)" />
              <AppText style={{ fontSize: 9, fontWeight: '500', color: 'rgba(255,255,255,0.94)' }}>
                Kuala Lumpur
              </AppText>
            </View>
          </View>
        </View>
      );
    }
    case 'T-05': {
      // Dark bg, two photo bubbles + a real sent-text bubble
      const contentW = width - 12;
      const textBubbleH = 20;
      const photoAreaH = height - 12 - textBubbleH - 12;
      const bubbleH = photoAreaH / 2;
      const bubble1W = contentW * 0.65;
      const bubble2W = contentW * 0.58;
      const textBubbleW = contentW * 0.6;
      return (
        <View style={{ width, height, backgroundColor: '#000', padding: 6, gap: 6 }}>
          <View style={{ alignSelf: 'flex-end', width: bubble1W, height: bubbleH, overflow: 'hidden', borderRadius: 10, backgroundColor: '#161616' }}>
            <Image source={MOCK_PHOTOS.t05[0]} style={{ width: bubble1W, height: bubbleH }} resizeMode="cover" />
          </View>
          <View style={{ alignSelf: 'flex-start', width: bubble2W, height: bubbleH, overflow: 'hidden', borderRadius: 10, backgroundColor: '#161616' }}>
            <Image source={MOCK_PHOTOS.t05[1]} style={{ width: bubble2W, height: bubbleH }} resizeMode="cover" />
          </View>
          <View style={{ alignSelf: 'flex-end', width: textBubbleW, height: textBubbleH, backgroundColor: '#007AFF', borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 }}>
            <AppText style={{ fontSize: 9, color: '#fff', fontWeight: '600' }} numberOfLines={1}>
              Exploring Berlin.
            </AppText>
          </View>
        </View>
      );
    }
    case 'T-06': {
      // 3 horizontal strips, each with the real template's bold metadata-style caption
      const cellW = width;
      const cellH = (height - 6) / 3;
      const stripLabels = ['72°F', 'Central Park', 'New York'];
      return (
        <View style={{ width, height, gap: 3 }}>
          {MOCK_PHOTOS.t06.map((source, i) => (
            <View key={i} style={{ width: cellW, height: cellH, overflow: 'hidden', backgroundColor: '#161616', position: 'relative' }}>
              <Image source={source} style={{ width: cellW, height: cellH }} resizeMode="cover" />
              <View style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, alignItems: 'center', justifyContent: 'center' }} pointerEvents="none">
                <AppText
                  style={{
                    fontFamily: FONTS.inter,
                    fontWeight: '700',
                    fontSize: 11,
                    color: '#fff',
                    textShadowColor: 'rgba(0,0,0,0.55)',
                    textShadowOffset: { width: 0, height: 1 },
                    textShadowRadius: 3,
                  }}
                >
                  {stripLabels[i]}
                </AppText>
              </View>
            </View>
          ))}
        </View>
      );
    }
    case 'T-07': {
      // Background photo with a minimal one-week calendar strip — a month label, weekday
      // letters, then a row of flags, so it reads as a calendar rather than just flags.
      // No card background: matches the real template's direct-over-photo, text-shadow look.
      const weekdayLetters = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
      const weekFlags = ['🇮🇹', '🇮🇹', '🇮🇹', '🇮🇹', '🇫🇷', '🇫🇷', '🇫🇷'];
      const textShadowStyle = {
        textShadowColor: 'rgba(0,0,0,0.5)',
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 3,
      };
      const cellW = 18;
      return (
        <View style={{ width, height, position: 'relative', overflow: 'hidden' }}>
          <Image source={MOCK_PHOTOS.t07[0]} style={{ width, height }} resizeMode="cover" />
          <View style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, alignItems: 'center', justifyContent: 'center' }} pointerEvents="none">
            <View>
              <AppText
                style={[{ fontSize: 9, fontWeight: '700', color: '#fff', textAlign: 'center', marginBottom: 4 }, textShadowStyle]}
              >
                May
              </AppText>
              <View style={{ flexDirection: 'row', marginBottom: 3 }}>
                {weekdayLetters.map((w, i) => (
                  <AppText
                    key={i}
                    style={[{ width: cellW, fontSize: 6, fontWeight: '700', color: 'rgba(255,255,255,0.7)', textAlign: 'center' }, textShadowStyle]}
                  >
                    {w}
                  </AppText>
                ))}
              </View>
              <View style={{ flexDirection: 'row' }}>
                {weekFlags.map((flag, i) => (
                  <AppText key={i} style={[{ width: cellW, fontSize: 10, lineHeight: 12, textAlign: 'center' }, textShadowStyle]}>
                    {flag}
                  </AppText>
                ))}
              </View>
            </View>
          </View>
        </View>
      );
    }
    case 'T-11': {
      // Edge-to-edge 2-row grid with cinematic yellow subtitles matching T11DiptychTemplate.
      const cellW = width;
      const cellH = height / 2;
      const labels = ['Sagrada Família', 'Memories from summer'];
      return (
        <View style={{ width, height }}>
          {MOCK_PHOTOS.t11.map((source, i) => (
            <View key={i} style={{ width: cellW, height: cellH, overflow: 'hidden', backgroundColor: '#161616', position: 'relative' }}>
              <Image source={source} style={{ width: cellW, height: cellH }} resizeMode="cover" />
              <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, paddingBottom: 8, paddingTop: 4, alignItems: 'center' }} pointerEvents="none">
                <AppText
                  style={{
                    color: '#FFE600',
                    fontSize: 10,
                    fontWeight: '500',
                    fontStyle: 'italic',
                    fontFamily: Platform.OS === 'ios' ? 'Helvetica' : undefined,
                    textShadowColor: 'rgba(0,0,0,0.85)',
                    textShadowOffset: { width: 0, height: 1 },
                    textShadowRadius: 2,
                  }}
                >
                  {labels[i].toLowerCase()}
                </AppText>
              </View>
            </View>
          ))}
        </View>
      );
    }
    case 'C-01': {
      // Two full-width rows. Thin gap here is a mockup-only affordance so the grid actually
      // reads at this size — the real editable template (C01TwoRowsTemplate) has no gap.
      const cellW = width;
      const cellH = (height - MOCK_GRID_GAP) / 2;
      return (
        <View style={{ width, height, gap: MOCK_GRID_GAP }}>
          <MockPhoto source={MOCK_PHOTOS.c01[0]} width={cellW} height={cellH} />
          <MockPhoto source={MOCK_PHOTOS.c01[1]} width={cellW} height={cellH} />
        </View>
      );
    }
    case 'C-02': {
      // Three full-width rows
      const cellW = width;
      const cellH = (height - MOCK_GRID_GAP * 2) / 3;
      return (
        <View style={{ width, height, gap: MOCK_GRID_GAP }}>
          <MockPhoto source={MOCK_PHOTOS.c02[0]} width={cellW} height={cellH} />
          <MockPhoto source={MOCK_PHOTOS.c02[1]} width={cellW} height={cellH} />
          <MockPhoto source={MOCK_PHOTOS.c02[2]} width={cellW} height={cellH} />
        </View>
      );
    }
    case 'C-03': {
      // Plain 2x2 grid, no notecard
      const cellW = (width - MOCK_GRID_GAP) / 2;
      const cellH = (height - MOCK_GRID_GAP) / 2;
      return (
        <View style={{ width, height, gap: MOCK_GRID_GAP }}>
          <View style={{ flexDirection: 'row', gap: MOCK_GRID_GAP }}>
            <MockPhoto source={MOCK_PHOTOS.c03[0]} width={cellW} height={cellH} />
            <MockPhoto source={MOCK_PHOTOS.c03[1]} width={cellW} height={cellH} />
          </View>
          <View style={{ flexDirection: 'row', gap: MOCK_GRID_GAP }}>
            <MockPhoto source={MOCK_PHOTOS.c03[2]} width={cellW} height={cellH} />
            <MockPhoto source={MOCK_PHOTOS.c03[3]} width={cellW} height={cellH} />
          </View>
        </View>
      );
    }
    case 'C-04': {
      // 2 columns x 3 rows grid
      const cellW = (width - MOCK_GRID_GAP) / 2;
      const cellH = (height - MOCK_GRID_GAP * 2) / 3;
      return (
        <View style={{ width, height, gap: MOCK_GRID_GAP }}>
          <View style={{ flexDirection: 'row', gap: MOCK_GRID_GAP }}>
            <MockPhoto source={MOCK_PHOTOS.c04[0]} width={cellW} height={cellH} />
            <MockPhoto source={MOCK_PHOTOS.c04[1]} width={cellW} height={cellH} />
          </View>
          <View style={{ flexDirection: 'row', gap: MOCK_GRID_GAP }}>
            <MockPhoto source={MOCK_PHOTOS.c04[2]} width={cellW} height={cellH} />
            <MockPhoto source={MOCK_PHOTOS.c04[3]} width={cellW} height={cellH} />
          </View>
          <View style={{ flexDirection: 'row', gap: MOCK_GRID_GAP }}>
            <MockPhoto source={MOCK_PHOTOS.c04[4]} width={cellW} height={cellH} />
            <MockPhoto source={MOCK_PHOTOS.c04[5]} width={cellW} height={cellH} />
          </View>
        </View>
      );
    }
    case 'C-05': {
      // 1 full-width row on top, 2 side-by-side below
      const topW = width;
      const rowH = (height - MOCK_GRID_GAP) / 2;
      const bottomCellW = (width - MOCK_GRID_GAP) / 2;
      return (
        <View style={{ width, height, gap: MOCK_GRID_GAP }}>
          <MockPhoto source={MOCK_PHOTOS.c05[0]} width={topW} height={rowH} />
          <View style={{ flexDirection: 'row', gap: MOCK_GRID_GAP }}>
            <MockPhoto source={MOCK_PHOTOS.c05[1]} width={bottomCellW} height={rowH} />
            <MockPhoto source={MOCK_PHOTOS.c05[2]} width={bottomCellW} height={rowH} />
          </View>
        </View>
      );
    }
    case 'T-12': {
      return (
        <View style={{ width, height, overflow: 'hidden' }}>
          <Image source={MOCK_PHOTOS.t12[0]} style={{ width, height }} resizeMode="cover" />
        </View>
      );
    }
    default:
      return (
        <View style={{ width, height, padding: 8, gap: 4 }}>
          <View style={[{ flex: 1 }, darkRect]} />
          <View style={[{ flex: 1 }, darkRect]} />
        </View>
      );
  }
};

interface TabPillProps {
  activeTab: TabKey;
  onChange: (tab: TabKey) => void;
}

const TABS: { key: TabKey; label: string }[] = [
  { key: 'templates', label: 'Templates' },
  { key: 'gallery', label: 'Gallery' },
];

const TabPill: React.FC<TabPillProps> = ({ activeTab, onChange }) => {
  const { colors, isDark } = useTheme();
  const reduceMotion = useReduceMotion();
  const layoutsRef = useRef<Partial<Record<TabKey, { x: number; width: number }>>>({});
  const indicatorX = useRef(new Animated.Value(0)).current;
  const indicatorW = useRef(new Animated.Value(0)).current;
  const hasPositionedRef = useRef(false);
  const [indicatorReady, setIndicatorReady] = useState(false);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        outer: {
          alignItems: 'center',
          paddingBottom: 16,
        },
        pill: {
          flexDirection: 'row',
          backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
          borderRadius: 22,
          padding: 4,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.border,
          position: 'relative',
        },
        indicator: {
          position: 'absolute',
          top: 4,
          bottom: 4,
          left: 0,
          borderRadius: 18,
          backgroundColor: isDark ? 'rgba(255,255,255,0.16)' : '#fff',
        },
        segment: {
          paddingHorizontal: 22,
          paddingVertical: 9,
          borderRadius: 18,
          zIndex: 1,
        },
        segmentActiveFallback: {
          backgroundColor: isDark ? 'rgba(255,255,255,0.16)' : '#fff',
        },
        segmentText: {
          fontFamily: FONTS.inter,
          fontSize: 14,
          fontWeight: FONT_WEIGHTS.semibold,
          color: colors.textSecondary,
        },
        segmentTextActive: {
          color: colors.textPrimary,
        },
      }),
    [colors, isDark]
  );

  useEffect(() => {
    const layout = layoutsRef.current[activeTab];
    if (!layout || !hasPositionedRef.current) return;

    if (reduceMotion) {
      indicatorX.setValue(layout.x);
      indicatorW.setValue(layout.width);
      return;
    }

    const anim = Animated.parallel([
      Animated.timing(indicatorX, {
        toValue: layout.x,
        duration: PILL_SLIDE_MS,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }),
      Animated.timing(indicatorW, {
        toValue: layout.width,
        duration: PILL_SLIDE_MS,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }),
    ]);
    anim.start();
    return () => anim.stop();
  }, [activeTab, reduceMotion, indicatorX, indicatorW]);

  const handleSegmentLayout = (key: TabKey, x: number, width: number) => {
    const prev = layoutsRef.current[key];
    if (prev && Math.abs(prev.x - x) < 0.5 && Math.abs(prev.width - width) < 0.5) return;
    layoutsRef.current[key] = { x, width };

    const allMeasured = TABS.every((tab) => layoutsRef.current[tab.key] != null);
    if (!allMeasured) return;

    const activeLayout = layoutsRef.current[activeTab];
    if (!activeLayout) return;

    if (!hasPositionedRef.current) {
      indicatorX.setValue(activeLayout.x);
      indicatorW.setValue(activeLayout.width);
      hasPositionedRef.current = true;
      setIndicatorReady(true);
      return;
    }

    // Theme / layout resize: snap indicator to current tab
    if (key === activeTab) {
      indicatorX.setValue(activeLayout.x);
      indicatorW.setValue(activeLayout.width);
    }
  };

  return (
    <View style={styles.outer}>
      <View style={styles.pill}>
        {indicatorReady ? (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.indicator,
              {
                width: indicatorW,
                transform: [{ translateX: indicatorX }],
              },
            ]}
          />
        ) : null}
        {TABS.map((tab) => {
          const isActive = tab.key === activeTab;
          return (
            <TouchableOpacity
              key={tab.key}
              style={[
                styles.segment,
                !indicatorReady && isActive && styles.segmentActiveFallback,
              ]}
              onPress={() => {
                if (tab.key !== activeTab) onChange(tab.key);
              }}
              onLayout={(e) => {
                const { x, width } = e.nativeEvent.layout;
                handleSegmentLayout(tab.key, x, width);
              }}
              activeOpacity={0.75}
              accessibilityRole="button"
              accessibilityLabel={tab.label}
              accessibilityState={{ selected: isActive }}
            >
              <AppText style={[styles.segmentText, isActive && styles.segmentTextActive]}>
                {tab.label}
              </AppText>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
};

const PostcardTemplatesScreen: React.FC = () => {
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { entries } = useAppContext();
  const { width: screenWidth } = useWindowDimensions();
  const [activeTab, setActiveTab] = useState<TabKey>('templates');

  const cardWidth = (screenWidth - SPACING.lg * 2 - CARD_GAP) / COLUMNS;
  const previewHeight = cardWidth * (4 / 3); // no label row anymore — the photo fills the whole card
  const gallerySize = (screenWidth - GALLERY_CELL_GAP * (GALLERY_COLUMNS + 1)) / GALLERY_COLUMNS;
  // Collages are a single scrollable row, sized smaller than the styled-template cards and unlabeled.
  // Sized toward an Instagram-Story-like portrait ratio so the grid (2x2, 2x3, etc.) actually reads.
  const collageCardWidth = cardWidth * 0.72;
  const collageCardHeight = collageCardWidth * 1.6;

  const styledTemplates = useMemo(
    () => TEMPLATE_REGISTRY.filter((t) => t.category === 'styled'),
    []
  );
  const collageTemplates = useMemo(
    () => TEMPLATE_REGISTRY.filter((t) => t.category === 'collage'),
    []
  );

  const galleryPhotos = useMemo(() => {
    return [...entries]
      .filter((e) => !e.isDraft)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .flatMap((entry) =>
        (entry.photoPaths || [])
          .filter(Boolean)
          .map((uri) => ({ uri, entry }))
      );
  }, [entries]);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: {
          flex: 1,
          backgroundColor: colors.background,
        },
        header: {
          flexDirection: 'row',
          alignItems: 'center',
          paddingTop: insets.top + 8,
          paddingHorizontal: SPACING.lg,
          paddingBottom: 16,
        },
        backButton: {
          width: 40,
          height: 40,
          alignItems: 'center',
          justifyContent: 'center',
          marginRight: 4,
        },
        title: {
          fontFamily: FONTS.inter,
          fontSize: 20,
          fontWeight: FONT_WEIGHTS.bold,
          color: colors.textPrimary,
        },
        subtitle: {
          fontFamily: FONTS.inter,
          fontSize: 14,
          color: colors.textSecondary,
          paddingHorizontal: SPACING.lg,
          marginBottom: 20,
        },
        sectionLabel: {
          fontFamily: FONTS.inter,
          fontSize: 16,
          fontWeight: FONT_WEIGHTS.bold,
          color: colors.textPrimary,
          paddingHorizontal: SPACING.lg,
          marginBottom: 12,
        },
        templatesLabel: {
          marginTop: 28,
        },
        collageRow: {
          gap: CARD_GAP,
          paddingBottom: CARD_GAP,
        },
        collageCard: {
          width: collageCardWidth,
          height: collageCardHeight,
          borderRadius: 10,
          overflow: 'hidden',
          backgroundColor: '#111',
          borderWidth: 1,
          borderColor: colors.border,
        },
        list: {
          paddingHorizontal: SPACING.lg,
          paddingBottom: insets.bottom + 24,
        },
        row: {
          flexDirection: 'row',
          gap: CARD_GAP,
          marginBottom: CARD_GAP,
        },
        card: {
          width: cardWidth,
          borderRadius: 12,
          overflow: 'hidden',
          backgroundColor: colors.surfaceVariant,
          borderWidth: 1,
          borderColor: colors.border,
        },
        previewArea: {
          height: previewHeight,
          backgroundColor: '#111',
          overflow: 'hidden',
        },
        galleryGrid: {
          padding: GALLERY_CELL_GAP,
          paddingBottom: insets.bottom + 24,
        },
        galleryCell: {
          margin: GALLERY_CELL_GAP / 2,
        },
        emptyGallery: {
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          gap: 12,
          paddingBottom: insets.bottom + 60,
        },
        emptyGalleryText: {
          fontFamily: FONTS.inter,
          fontSize: 15,
          color: colors.textSecondary,
        },
      }),
    [colors, insets, cardWidth, previewHeight, collageCardWidth, collageCardHeight]
  );

  const renderCollageCard = (template: TemplateRegistryEntry) => (
    <TouchableOpacity
      key={template.id}
      style={styles.collageCard}
      onPress={() => navigation.navigate('PostcardEditor', { templateId: template.id })}
      activeOpacity={0.72}
      accessibilityRole="button"
      accessibilityLabel={`Use ${template.displayName} layout`}
    >
      <TemplatePreview templateId={template.id} width={collageCardWidth} height={collageCardHeight} />
    </TouchableOpacity>
  );

  const renderTemplateCard = (template: TemplateRegistryEntry) => (
    <TouchableOpacity
      key={template.id}
      style={styles.card}
      onPress={() => navigation.navigate('PostcardEditor', { templateId: template.id })}
      activeOpacity={0.72}
      accessibilityRole="button"
      accessibilityLabel={`Use ${template.displayName} template`}
    >
      <View style={styles.previewArea}>
        <TemplatePreview templateId={template.id} width={cardWidth} height={previewHeight} />
      </View>
    </TouchableOpacity>
  );

  const renderRows = (templates: TemplateRegistryEntry[]) => {
    const rows: TemplateRegistryEntry[][] = [];
    for (let i = 0; i < templates.length; i += COLUMNS) {
      rows.push(templates.slice(i, i + COLUMNS));
    }
    return rows.map((row, i) => (
      <View key={i} style={styles.row}>
        {row.map(renderTemplateCard)}
      </View>
    ));
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <AppText style={styles.title}>New Postcard</AppText>
      </View>

      <TabPill activeTab={activeTab} onChange={setActiveTab} />

      {activeTab === 'templates' ? (
        <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
          <AppText style={styles.sectionLabel}>Collages</AppText>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.collageRow}
          >
            {collageTemplates.map(renderCollageCard)}
          </ScrollView>

          <AppText style={[styles.sectionLabel, styles.templatesLabel]}>Templates</AppText>
          {renderRows(styledTemplates)}
        </ScrollView>
      ) : galleryPhotos.length === 0 ? (
        <View style={styles.emptyGallery}>
          <Ionicons name="images-outline" size={48} color={colors.textSecondary} />
          <AppText style={styles.emptyGalleryText}>No photos yet</AppText>
        </View>
      ) : (
        <FlatList
          data={galleryPhotos}
          keyExtractor={(item, index) => `${item.uri}-${index}`}
          numColumns={GALLERY_COLUMNS}
          renderItem={({ item }: { item: { uri: string; entry: Entry } }) => (
            <TouchableOpacity
              style={styles.galleryCell}
              onPress={() =>
                navigation.navigate('PostcardStoryEditor', {
                  photoUri: item.uri,
                  entryId: item.entry.id,
                })
              }
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel="Use this photo"
            >
              <Image
                source={{ uri: item.uri }}
                style={{ width: gallerySize, height: gallerySize }}
                resizeMode="cover"
                accessibilityIgnoresInvertColors
              />
            </TouchableOpacity>
          )}
          contentContainerStyle={styles.galleryGrid}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
};

export default PostcardTemplatesScreen;
