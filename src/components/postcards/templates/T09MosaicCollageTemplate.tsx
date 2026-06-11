import React from 'react';
import { View, Image, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AppText from '../../common/AppText';
import { PostcardFramedPhotoSlot } from '../PostcardFramedPhotoSlot';
import type { TemplateBaseProps } from './sharedTypes';
import {
  entryDestination,
  entryTempString,
  entryAltString,
  entryWeatherString,
  entrySeasonString,
} from './sharedTypes';
import { FONTS } from '../../../config/constants';

const T09MosaicCollageTemplate = React.forwardRef<View, TemplateBaseProps>(
  (
    {
      slots,
      onSlotPress,
      onTransformChange,
      onResetSlotFraming,
      aspectRatio = 1,
      editingChromeSuppressed = false,
      previewMode = false,
      scale = 1,
    },
    ref
  ) => {
    const clampedScale = Math.max(0.3, Math.min(1, scale));
    const s = (v: number) => Math.max(1, Math.round(v * clampedScale));

    const defaultSlot = { photoUri: null, transform: { scale: 1, translateX: 0, translateY: 0 }, resetKey: 0, entry: null };
    const slot0 = slots[0] ?? defaultSlot;
    const slot1 = slots[1] ?? defaultSlot;
    const slot2 = slots[2] ?? defaultSlot;
    const slot3 = slots[3] ?? defaultSlot;

    const chromeSize = Math.max(12, Math.round(18 * clampedScale));
    const emptyIconSize = Math.max(12, Math.round(20 * clampedScale));

    const destination = entryDestination(slot0.entry);
    const overlayText = (destination || slot0.entry?.country || '').toUpperCase();

    // Contextual data values
    const dataValues: string[] = [];
    const temp = entryTempString(slot0.entry);
    if (temp) dataValues.push(temp);
    const season = entrySeasonString(slot0.entry);
    if (season && dataValues.length < 2) dataValues.push(season);
    const weather = entryWeatherString(slot0.entry);
    if (weather && dataValues.length < 2) dataValues.push(weather);
    const alt = entryAltString(slot0.entry);
    if (alt && dataValues.length < 2) dataValues.push(alt);

    const renderCell = (slotData: typeof slot0, index: number) => {
      if (slotData.photoUri) {
        return (
          <View style={st.cell} key={index}>
            {previewMode || editingChromeSuppressed ? (
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
                  style={[st.chromeBtn, { width: s(26), height: s(26), borderRadius: s(13) }]}
                  onPress={() => onResetSlotFraming?.(index)}
                  hitSlop={{ top: 5, bottom: 5, left: 5, right: 5 }}
                  accessibilityRole="button"
                  accessibilityLabel={`Reset photo ${index + 1} framing`}
                >
                  <Ionicons name="refresh-outline" size={chromeSize} color="rgba(255,255,255,0.9)" />
                </TouchableOpacity>
                <TouchableOpacity
                  style={[st.chromeBtn, { width: s(26), height: s(26), borderRadius: s(13) }]}
                  onPress={() => onSlotPress?.(index)}
                  hitSlop={{ top: 5, bottom: 5, left: 5, right: 5 }}
                  accessibilityRole="button"
                  accessibilityLabel={`Change photo ${index + 1}`}
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
          {!previewMode && <AppText style={{ color: '#555', fontSize: s(10) }}>Tap</AppText>}
        </TouchableOpacity>
      );
    };

    return (
      <View ref={ref} collapsable={false} style={[st.container, { aspectRatio }]}>
        {/* Photo grid */}
        <View style={st.photoGrid}>
          <View style={st.row}>
            {renderCell(slot0, 0)}
            <View style={{ width: s(4) }} />
            {renderCell(slot1, 1)}
          </View>
          <View style={{ height: s(4) }} />
          <View style={st.row}>
            {renderCell(slot2, 2)}
            <View style={{ width: s(4) }} />
            {renderCell(slot3, 3)}
          </View>

          {/* Large bold text overlay */}
          {overlayText ? (
            <View style={st.textOverlay} pointerEvents="none">
              <AppText
                style={{
                  fontFamily: FONTS.inter,
                  fontWeight: '900',
                  fontSize: s(56),
                  color: '#fff',
                  textShadowColor: 'rgba(0,0,0,0.5)',
                  textShadowOffset: { width: 0, height: 2 },
                  textShadowRadius: 8,
                  letterSpacing: s(2),
                  textAlign: 'center',
                }}
                numberOfLines={2}
              >
                {overlayText}
              </AppText>
            </View>
          ) : null}
        </View>

        {/* Data strip */}
        <View style={[st.dataStrip, { height: s(36), paddingHorizontal: s(12), gap: s(16) }]}>
          {dataValues.slice(0, 2).map((val, i) => (
            <AppText key={i} style={{ fontFamily: FONTS.inter, fontWeight: '400', fontSize: s(11), color: '#999' }}>
              {val}
            </AppText>
          ))}
          <View style={{ flex: 1 }} />
          <AppText style={{ fontFamily: FONTS.inter, fontWeight: '400', fontSize: s(9), color: '#555' }}>
            Journey Onward
          </AppText>
        </View>
      </View>
    );
  }
);

T09MosaicCollageTemplate.displayName = 'T09MosaicCollageTemplate';

export default T09MosaicCollageTemplate;

const st = StyleSheet.create({
  container: {
    backgroundColor: '#000',
    overflow: 'hidden',
    flexDirection: 'column',
  },
  photoGrid: {
    flex: 1,
    backgroundColor: '#fff',
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
    paddingHorizontal: 5,
    paddingTop: 5,
    zIndex: 3,
  },
  chromeBtn: {
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  textOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 5,
  },
  dataStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#111',
  },
});
