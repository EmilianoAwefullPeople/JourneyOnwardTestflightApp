import React from 'react';
import { View, Image, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AppText from '../../common/AppText';
import { PostcardFramedPhotoSlot } from '../PostcardFramedPhotoSlot';
import type { TemplateBaseProps } from './sharedTypes';
import { FONTS } from '../../../config/constants';
import { getStripTextForCategory, parseDataCategory } from './triptychStampsUtils';

const T06VerticalTriptychTemplate = React.forwardRef<View, TemplateBaseProps>(
  (
    {
      slots,
      onSlotPress,
      onTransformChange,
      onResetSlotFraming,
      templateData,
      aspectRatio = 9 / 16,
      editingChromeSuppressed = false,
      previewMode = false,
      scale = 1,
    },
    ref
  ) => {
    const clampedScale = Math.max(0.3, Math.min(1, scale));
    const s = (v: number) => Math.max(1, Math.round(v * clampedScale));
    const dataCategory = parseDataCategory(templateData);

    const defaultSlot = { photoUri: null, transform: { scale: 1, translateX: 0, translateY: 0 }, resetKey: 0, entry: null };
    const slot0 = slots[0] ?? defaultSlot;
    const slot1 = slots[1] ?? defaultSlot;
    const slot2 = slots[2] ?? defaultSlot;

    const chromeSize = Math.max(12, Math.round(20 * clampedScale));
    const emptyIconSize = Math.max(14, Math.round(22 * clampedScale));

    const renderStrip = (slotData: typeof slot0, index: number) => {
      const stripText = getStripTextForCategory(slotData.entry, dataCategory);

      return (
        <View style={st.strip} key={index}>
          {slotData.photoUri ? (
            <>
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
                    style={[st.chromeBtn, { width: s(28), height: s(28), borderRadius: s(14) }]}
                    onPress={() => onResetSlotFraming?.(index)}
                    hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                    accessibilityRole="button"
                    accessibilityLabel={`Reset strip ${index + 1} framing`}
                  >
                    <Ionicons name="refresh-outline" size={chromeSize} color="rgba(255,255,255,0.9)" />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[st.chromeBtn, { width: s(28), height: s(28), borderRadius: s(14) }]}
                    onPress={() => onSlotPress?.(index)}
                    hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                    accessibilityRole="button"
                    accessibilityLabel={`Change strip ${index + 1} photo`}
                  >
                    <Ionicons name="images-outline" size={chromeSize} color="rgba(255,255,255,0.9)" />
                  </TouchableOpacity>
                </View>
              )}
            </>
          ) : (
            <TouchableOpacity
              style={st.emptyStrip}
              onPress={() => !previewMode && onSlotPress?.(index)}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={`Add photo ${index + 1}`}
            >
              <Ionicons name="image-outline" size={emptyIconSize} color="#555" />
              {!previewMode && <AppText style={{ color: '#555', fontSize: s(10) }}>Tap to add</AppText>}
            </TouchableOpacity>
          )}
          {stripText ? (
            <View style={st.textOverlay} pointerEvents="none">
              <AppText
                style={{
                  fontFamily: FONTS.inter,
                  fontWeight: '700',
                  fontSize: s(30),
                  color: '#fff',
                  textAlign: 'center',
                  textShadowColor: 'rgba(0,0,0,0.55)',
                  textShadowOffset: { width: 0, height: 2 },
                  textShadowRadius: 8,
                }}
                numberOfLines={1}
              >
                {stripText}
              </AppText>
            </View>
          ) : null}
        </View>
      );
    };

    return (
      <View ref={ref} collapsable={false} style={[st.container, { aspectRatio }]}>
        {renderStrip(slot0, 0)}
        {renderStrip(slot1, 1)}
        {renderStrip(slot2, 2)}
      </View>
    );
  }
);

T06VerticalTriptychTemplate.displayName = 'T06VerticalTriptychTemplate';

export default T06VerticalTriptychTemplate;

const st = StyleSheet.create({
  container: {
    backgroundColor: '#000',
    overflow: 'hidden',
    flexDirection: 'column',
  },
  strip: {
    flex: 1,
    overflow: 'hidden',
    backgroundColor: '#1a1a1a',
    position: 'relative',
  },
  emptyStrip: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
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
  textOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 5,
  },
});
