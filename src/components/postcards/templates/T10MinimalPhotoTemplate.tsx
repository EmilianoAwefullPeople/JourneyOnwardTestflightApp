import React from 'react';
import { View, Image, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AppText from '../../common/AppText';
import { PostcardFramedPhotoSlot } from '../PostcardFramedPhotoSlot';
import type { TemplateBaseProps } from './sharedTypes';
import {
  formatLongDate,
  entryDestination,
  entryTempString,
  entryAltString,
  entryWeatherString,
  entrySeasonString,
} from './sharedTypes';
import { FONTS } from '../../../config/constants';

const T10MinimalPhotoTemplate = React.forwardRef<View, TemplateBaseProps>(
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
    const chromeSize = Math.max(12, Math.round(22 * clampedScale));
    const emptyIconSize = Math.max(16, Math.round(28 * clampedScale));

    const dateText = formatLongDate(entry?.timestamp);
    const statTemp = entryTempString(entry);
    const statAltOrWeather = entryAltString(entry) ?? entryWeatherString(entry);
    const statSeasonOrCity = entrySeasonString(entry) ?? entryDestination(entry);
    const stats = [statTemp, statAltOrWeather, statSeasonOrCity].filter(Boolean) as string[];

    const playfairItalic = {
      fontFamily: FONTS.playfairDisplay,
      fontStyle: 'italic' as const,
      color: '#1A1A1A',
    };

    return (
      <View ref={ref} collapsable={false} style={[st.container, { aspectRatio }]}>
        {dateText ? (
          <View style={[st.dateSection, { paddingTop: s(28), paddingHorizontal: s(24) }]}>
            <AppText
              style={[playfairItalic, { fontSize: s(20), textAlign: 'center' }]}
              numberOfLines={2}
            >
              {dateText}
            </AppText>
          </View>
        ) : null}

        <View style={[st.photoWrapper, { marginTop: s(dateText ? 16 : 32), borderRadius: 0, overflow: 'hidden' }]}>
          {slot0.photoUri ? (
            previewMode || editingChromeSuppressed ? (
              <Image source={{ uri: slot0.photoUri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
            ) : (
              <>
                <PostcardFramedPhotoSlot
                  uri={slot0.photoUri}
                  transform={slot0.transform}
                  onTransformChange={(t) => onTransformChange?.(0, t)}
                  resetKey={slot0.resetKey}
                  interactionEnabled={!previewMode}
                />
                {!editingChromeSuppressed && (
                  <View style={st.editChrome} pointerEvents="box-none">
                    <TouchableOpacity
                      style={st.chromeBtn}
                      onPress={() => onResetSlotFraming?.(0)}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      accessibilityRole="button"
                      accessibilityLabel="Reset photo framing"
                    >
                      <Ionicons name="refresh-outline" size={chromeSize} color="rgba(0,0,0,0.7)" />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={st.chromeBtn}
                      onPress={() => onSlotPress?.(0)}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      accessibilityRole="button"
                      accessibilityLabel="Change photo"
                    >
                      <Ionicons name="images-outline" size={chromeSize} color="rgba(0,0,0,0.7)" />
                    </TouchableOpacity>
                  </View>
                )}
              </>
            )
          ) : (
            <TouchableOpacity
              style={st.emptyPhoto}
              onPress={() => !previewMode && onSlotPress?.(0)}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Add photo"
            >
              <Ionicons name="image-outline" size={emptyIconSize} color="#aaa" />
              {!previewMode && <AppText style={{ color: '#aaa', fontSize: s(12) }}>Tap to add photo</AppText>}
            </TouchableOpacity>
          )}
        </View>

        {stats.length > 0 ? (
          <View style={[st.statsRow, { paddingTop: s(16), paddingBottom: s(24), paddingHorizontal: s(16) }]}>
            {statTemp ? (
              <AppText style={[playfairItalic, st.statCell, { fontSize: s(16) }]} numberOfLines={1}>
                {statTemp}
              </AppText>
            ) : null}
            {statAltOrWeather ? (
              <AppText style={[playfairItalic, st.statCell, { fontSize: s(16) }]} numberOfLines={1}>
                {statAltOrWeather}
              </AppText>
            ) : null}
            {statSeasonOrCity ? (
              <AppText style={[playfairItalic, st.statCell, { fontSize: s(16) }]} numberOfLines={1}>
                {statSeasonOrCity}
              </AppText>
            ) : null}
          </View>
        ) : null}
      </View>
    );
  }
);

T10MinimalPhotoTemplate.displayName = 'T10MinimalPhotoTemplate';

export default T10MinimalPhotoTemplate;

const st = StyleSheet.create({
  container: {
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
    flexDirection: 'column',
  },
  dateSection: {
    alignItems: 'center',
  },
  photoWrapper: {
    width: '88%',
    aspectRatio: 4 / 5,
    alignSelf: 'center',
    backgroundColor: '#eee',
    position: 'relative',
  },
  emptyPhoto: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#e8e8e8',
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
    backgroundColor: 'rgba(255,255,255,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    width: '100%',
  },
  statCell: {
    flex: 1,
    textAlign: 'center',
  },
});
