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
  entrySeasonString,
} from './sharedTypes';
import { FONTS } from '../../../config/constants';

const ORANGE = '#FF9500';
const CARD_BG = 'rgba(28,28,30,0.92)';

const T08NotesDataLogTemplate = React.forwardRef<View, TemplateBaseProps>(
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

    const slot0 = slots[0] ?? {
      photoUri: null,
      transform: { scale: 1, translateX: 0, translateY: 0 },
      resetKey: 0,
      entry: null,
    };
    const entry = slot0.entry;
    const destination = entryDestination(entry);
    const heroStat = destination || entry?.title?.trim() || 'Journey';
    const year = entry?.timestamp ? new Date(entry.timestamp).getFullYear() : null;
    const chromeSize = Math.max(12, Math.round(22 * clampedScale));
    const emptyIconSize = Math.max(16, Math.round(28 * clampedScale));

    const dataLines: string[] = [];
    const notesDate = formatNotesDate(entry?.timestamp);
    if (notesDate) dataLines.push(notesDate);
    if (entry?.city && entry.city !== heroStat) dataLines.push(entry.city);
    if (entry?.country && entry.country !== heroStat) dataLines.push(entry.country);
    if (entry?.season && year) dataLines.push(`${entrySeasonString(entry)} ${year}`);
    const temp = entryTempString(entry);
    if (temp) dataLines.push(temp);
    const alt = entryAltString(entry);
    if (alt) dataLines.push(alt);
    const weather = entryWeatherString(entry);
    if (weather) dataLines.push(weather);
    if (entry?.emotionLabels?.length) dataLines.push(entry.emotionLabels.join(', '));

    return (
      <View ref={ref} collapsable={false} style={[st.container, { aspectRatio }]}>
        {/* Full-bleed background photo */}
        {slot0.photoUri ? (
          previewMode ? (
            <Image source={{ uri: slot0.photoUri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
          ) : (
            <View style={StyleSheet.absoluteFill}>
              <PostcardFramedPhotoSlot
                uri={slot0.photoUri}
                transform={slot0.transform}
                onTransformChange={(t) => onTransformChange?.(0, t)}
                resetKey={slot0.resetKey}
                interactionEnabled={!previewMode}
              />
            </View>
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

        {/* Centered data log card */}
        <View style={st.cardOverlay} pointerEvents="box-none">
          <View
            style={[
              st.card,
              {
                width: '78%',
                borderRadius: s(18),
                paddingHorizontal: s(18),
                paddingTop: s(16),
                paddingBottom: s(20),
              },
            ]}
          >
            {/* Header */}
            <View style={[st.headerRow, { marginBottom: s(14) }]}>
              <Ionicons name="airplane-outline" size={s(14)} color={ORANGE} />
              <AppText
                style={{
                  fontFamily: FONTS.inter,
                  fontSize: s(13),
                  fontWeight: '500',
                  color: ORANGE,
                  letterSpacing: 0.2,
                }}
              >
                journey log
              </AppText>
            </View>

            {/* Hero stat */}
            <AppText
              style={{
                fontFamily: FONTS.inter,
                fontSize: s(34),
                fontWeight: '700',
                color: '#FFFFFF',
                marginBottom: s(14),
              }}
              numberOfLines={2}
            >
              {heroStat}
            </AppText>

            {/* Data list */}
            <View style={{ gap: s(4) }}>
              {dataLines.length > 0 ? (
                dataLines.map((line, i) => {
                  const isLast = i === dataLines.length - 1;
                  return (
                    <AppText
                      key={i}
                      style={{
                        fontFamily: FONTS.inter,
                        fontWeight: '400',
                        fontSize: s(14),
                        color: isLast ? ORANGE : '#FFFFFF',
                        lineHeight: s(20),
                      }}
                      numberOfLines={1}
                    >
                      {line}
                    </AppText>
                  );
                })
              ) : (
                <AppText
                  style={{
                    fontFamily: FONTS.inter,
                    fontWeight: '400',
                    fontSize: s(14),
                    color: ORANGE,
                  }}
                >
                  No data available
                </AppText>
              )}
            </View>
          </View>
        </View>

        {/* Edit chrome */}
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
    );
  }
);

T08NotesDataLogTemplate.displayName = 'T08NotesDataLogTemplate';

export default T08NotesDataLogTemplate;

const st = StyleSheet.create({
  container: {
    backgroundColor: '#1a1a1a',
    overflow: 'hidden',
    position: 'relative',
  },
  emptyPhoto: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#1a1a1a',
  },
  cardOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    backgroundColor: CARD_BG,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
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
});
