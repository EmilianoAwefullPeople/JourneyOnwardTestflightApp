import React from 'react';
import { View, Image, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AppText from '../../common/AppText';
import { PostcardFramedPhotoSlot } from '../PostcardFramedPhotoSlot';
import type { TemplateBaseProps } from './sharedTypes';
import {
  formatNotesDate,
  entryDestination,
  entryTempString,
  entryAltString,
  entryWeatherString,
} from './sharedTypes';
import { FONTS } from '../../../config/constants';

const GOLD = '#E8A820';

function metadataChip(entry: TemplateBaseProps['slots'][0]['entry']): {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
} | null {
  const temp = entryTempString(entry);
  if (temp) return { label: temp, icon: 'thermometer-outline' };

  const alt = entryAltString(entry);
  if (alt) return { label: alt, icon: 'trending-up-outline' };

  const weather = entryWeatherString(entry);
  if (weather) return { label: weather, icon: 'partly-sunny-outline' };

  const date = formatNotesDate(entry?.timestamp);
  if (date) return { label: date, icon: 'calendar-outline' };

  return null;
}

function noteBody(entry: TemplateBaseProps['slots'][0]['entry']): string {
  if (!entry) return '';
  const text = (entry.emotionNote?.trim() || entry.description?.trim() || '').replace(/\s+/g, ' ');
  return text;
}

const T07NotesJournalTemplate = React.forwardRef<View, TemplateBaseProps>(
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
    const entry = slot0.entry;
    const destination = entryDestination(entry);
    const titleText = destination || entry?.title?.trim() || '';
    const bodyText = noteBody(entry);
    const chip = metadataChip(entry);
    const chromeSize = Math.max(12, Math.round(22 * clampedScale));
    const emptyIconSize = Math.max(16, Math.round(28 * clampedScale));
    const chipIconSize = Math.max(10, Math.round(14 * clampedScale));

    return (
      <View ref={ref} collapsable={false} style={[st.container, { aspectRatio }]}>
        {/* Top photo area: ~62.5% */}
        <View style={st.photoArea}>
          {slot0.photoUri ? (
            previewMode ? (
              <Image source={{ uri: slot0.photoUri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
            ) : (
              <PostcardFramedPhotoSlot
                uri={slot0.photoUri}
                transform={slot0.transform}
                onTransformChange={(t) => onTransformChange?.(0, t)}
                resetKey={slot0.resetKey}
                interactionEnabled={!previewMode}
              />
            )
          ) : (
            <TouchableOpacity
              style={st.emptyPhoto}
              onPress={() => !previewMode && onSlotPress?.(0)}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Add photo"
            >
              <Ionicons name="image-outline" size={emptyIconSize} color="#555" />
              {!previewMode && <AppText style={{ color: '#555', fontSize: s(12) }}>Tap to add photo</AppText>}
            </TouchableOpacity>
          )}
          {slot0.photoUri && !previewMode && !editingChromeSuppressed && (
            <View style={st.editChrome} pointerEvents="box-none">
              <TouchableOpacity
                style={st.chromeBtn}
                onPress={() => onResetSlotFraming?.(0)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityRole="button"
                accessibilityLabel="Reset photo framing"
              >
                <Ionicons name="refresh-outline" size={chromeSize} color="rgba(255,255,255,0.92)" />
              </TouchableOpacity>
              <TouchableOpacity
                style={st.chromeBtn}
                onPress={() => onSlotPress?.(0)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityRole="button"
                accessibilityLabel="Change photo"
              >
                <Ionicons name="images-outline" size={chromeSize} color="rgba(255,255,255,0.92)" />
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Notes panel: ~37.5% */}
        <View style={st.notesPanel}>
          <View style={[st.chromeRow, { paddingHorizontal: s(16), paddingTop: s(12), paddingBottom: s(8) }]}>
            <AppText style={[st.chromeLabel, { fontSize: s(13) }]}>{'< travel notes'}</AppText>
            {chip ? (
              <View style={st.metadataChip}>
                <AppText style={[st.chipText, { fontSize: s(12) }]} numberOfLines={1}>
                  {chip.label}
                </AppText>
                <Ionicons name={chip.icon} size={chipIconSize} color={GOLD} />
              </View>
            ) : null}
          </View>

          {titleText ? (
            <AppText
              style={[st.title, { fontSize: s(24), paddingHorizontal: s(16), marginTop: s(4) }]}
              numberOfLines={1}
            >
              {titleText}
            </AppText>
          ) : null}

          {bodyText ? (
            <AppText
              style={[st.body, { fontSize: s(15), paddingHorizontal: s(16), marginTop: s(6) }]}
              numberOfLines={2}
            >
              {bodyText}
            </AppText>
          ) : null}
        </View>
      </View>
    );
  }
);

T07NotesJournalTemplate.displayName = 'T07NotesJournalTemplate';

export default T07NotesJournalTemplate;

const st = StyleSheet.create({
  container: {
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
    flexDirection: 'column',
  },
  photoArea: {
    flex: 13,
    overflow: 'hidden',
    backgroundColor: '#1a1a1a',
    position: 'relative',
  },
  emptyPhoto: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  editChrome: {
    position: 'absolute',
    top: 8,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    zIndex: 10,
  },
  chromeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  notesPanel: {
    flex: 7,
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
  },
  chromeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  chromeLabel: {
    fontFamily: FONTS.inter,
    fontWeight: '400',
    color: GOLD,
    flexShrink: 1,
  },
  metadataChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexShrink: 0,
    maxWidth: '55%',
  },
  chipText: {
    fontFamily: FONTS.inter,
    fontWeight: '400',
    color: GOLD,
  },
  title: {
    fontFamily: FONTS.inter,
    fontWeight: '700',
    color: '#1A1A1A',
  },
  body: {
    fontFamily: FONTS.inter,
    fontWeight: '400',
    color: '#1A1A1A',
    lineHeight: 20,
  },
});
