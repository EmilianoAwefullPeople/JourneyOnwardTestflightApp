import React from 'react';
import { View, Image, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AppText from '../../common/AppText';
import { PostcardFramedPhotoSlot } from '../PostcardFramedPhotoSlot';
import type { TemplateBaseProps } from './sharedTypes';
import {
  formatLongDate,
  entryDestination,
  entryTempString,
  entryWeatherString,
  entrySeasonString,
} from './sharedTypes';
import { Entry } from '../../../models/Entry';

const HIGHLIGHT = '#FFE566';

const SERIF = Platform.select({
  ios: 'Georgia',
  android: 'serif',
  default: 'serif',
});

type NoteSegment = { text: string; highlight?: boolean };

function buildNoteSegments(entry: Entry | null): NoteSegment[] {
  if (!entry) {
    return [{ text: 'Add photos to generate your travel note.' }];
  }

  const destination = entryDestination(entry);
  const country = entry.country?.trim() ?? '';
  const place =
    destination && country && destination !== country
      ? `${destination}, ${country}`
      : destination || country;
  const dateStr = formatLongDate(entry.timestamp);
  const temp = entryTempString(entry);
  const weather = entryWeatherString(entry);
  const season = entrySeasonString(entry);

  const segments: NoteSegment[] = [];

  if (dateStr) {
    segments.push({ text: dateStr, highlight: true });
    segments.push({ text: '. ' });
  }

  segments.push({ text: 'Traveling through ' });
  if (place) {
    segments.push({ text: place, highlight: true });
  } else {
    segments.push({ text: 'new places' });
  }

  if (season || temp || weather) {
    segments.push({ text: '. ' });
    if (season) {
      segments.push({ text: `${season} — ` });
    }
    if (temp) {
      segments.push({ text: temp, highlight: true });
    }
    if (temp && weather) {
      segments.push({ text: ', ' });
    }
    if (weather) {
      segments.push({ text: weather, highlight: !temp });
    }
    segments.push({ text: '.' });
  }

  return segments;
}

const T01QuadCollageTemplate = React.forwardRef<View, TemplateBaseProps>(
  (
    {
      slots,
      onSlotPress,
      onTransformChange,
      onResetSlotFraming,
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
    const slot1 = slots[1] ?? { photoUri: null, transform: { scale: 1, translateX: 0, translateY: 0 }, resetKey: 0, entry: null };
    const slot2 = slots[2] ?? { photoUri: null, transform: { scale: 1, translateX: 0, translateY: 0 }, resetKey: 0, entry: null };
    const slot3 = slots[3] ?? { photoUri: null, transform: { scale: 1, translateX: 0, translateY: 0 }, resetKey: 0, entry: null };

    const noteSegments = buildNoteSegments(slot0.entry);
    const chromeSize = Math.max(12, Math.round(20 * clampedScale));
    const emptyIconSize = Math.max(14, Math.round(22 * clampedScale));

    const renderSlot = (slotData: typeof slot0, index: number) => {
      if (slotData.photoUri) {
        return (
          <View style={st.cell} key={index}>
            {previewMode ? (
              <Image source={{ uri: slotData.photoUri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
            ) : (
              <PostcardFramedPhotoSlot
                uri={slotData.photoUri}
                transform={slotData.transform}
                onTransformChange={(t) => onTransformChange?.(index, t)}
                resetKey={slotData.resetKey}
                interactionEnabled={!previewMode}
              />
            )}
            {!previewMode && !editingChromeSuppressed && (
              <View style={st.chrome} pointerEvents="box-none">
                <TouchableOpacity
                  style={st.chromeBtn}
                  onPress={() => onResetSlotFraming?.(index)}
                  hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                  accessibilityRole="button"
                  accessibilityLabel={`Reset slot ${index + 1} framing`}
                >
                  <Ionicons name="refresh-outline" size={chromeSize} color="rgba(255,255,255,0.9)" />
                </TouchableOpacity>
                <TouchableOpacity
                  style={st.chromeBtn}
                  onPress={() => onSlotPress?.(index)}
                  hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                  accessibilityRole="button"
                  accessibilityLabel={`Change slot ${index + 1} photo`}
                >
                  <Ionicons name="images-outline" size={chromeSize} color="rgba(255,255,255,0.9)" />
                </TouchableOpacity>
              </View>
            )}
          </View>
        );
      }
      return (
        <TouchableOpacity
          key={index}
          style={[st.cell, st.emptyCell]}
          onPress={() => !previewMode && onSlotPress?.(index)}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={`Add photo ${index + 1}`}
        >
          <Ionicons name="image-outline" size={emptyIconSize} color="#555" />
          {!previewMode && <AppText style={{ color: '#555', fontSize: s(10) }}>Tap to add</AppText>}
        </TouchableOpacity>
      );
    };

    return (
      <View ref={ref} collapsable={false} style={[st.container, { aspectRatio }]}>
        <View style={st.grid}>
          <View style={st.row}>
            {renderSlot(slot0, 0)}
            {renderSlot(slot1, 1)}
          </View>
          <View style={st.row}>
            {renderSlot(slot2, 2)}
            {renderSlot(slot3, 3)}
          </View>

          <View style={st.noteAnchor} pointerEvents="none">
            <View
              style={[
                st.noteCard,
                {
                  paddingVertical: s(8),
                  paddingHorizontal: s(12),
                  borderRadius: s(2),
                  maxWidth: s(220),
                },
              ]}
            >
              <AppText
                style={{
                  fontFamily: SERIF,
                  fontSize: s(11),
                  color: '#1A1A1A',
                  lineHeight: s(16),
                  textAlign: 'center',
                }}
              >
                {noteSegments.map((seg, i) =>
                  seg.highlight ? (
                    <AppText
                      key={i}
                      style={{
                        fontFamily: SERIF,
                        fontSize: s(11),
                        lineHeight: s(16),
                        backgroundColor: HIGHLIGHT,
                        color: '#1A1A1A',
                      }}
                    >
                      {seg.text}
                    </AppText>
                  ) : (
                    <AppText
                      key={i}
                      style={{
                        fontFamily: SERIF,
                        fontSize: s(11),
                        lineHeight: s(16),
                        color: '#1A1A1A',
                      }}
                    >
                      {seg.text}
                    </AppText>
                  )
                )}
              </AppText>
            </View>
          </View>
        </View>
      </View>
    );
  }
);

T01QuadCollageTemplate.displayName = 'T01QuadCollageTemplate';

export default T01QuadCollageTemplate;

const st = StyleSheet.create({
  container: {
    backgroundColor: '#fff',
    overflow: 'hidden',
  },
  grid: {
    flex: 1,
    position: 'relative',
  },
  row: {
    flex: 1,
    flexDirection: 'row',
  },
  cell: {
    flex: 1,
    overflow: 'hidden',
    backgroundColor: '#1a1a1a',
    position: 'relative',
  },
  emptyCell: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  chrome: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 6,
    paddingTop: 6,
    zIndex: 3,
  },
  chromeBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  noteAnchor: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  noteCard: {
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
});
