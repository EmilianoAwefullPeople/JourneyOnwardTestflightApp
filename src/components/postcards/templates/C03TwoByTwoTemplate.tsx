import React from 'react';
import { View, Image, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AppText from '../../common/AppText';
import { PostcardFramedPhotoSlot } from '../PostcardFramedPhotoSlot';
import type { TemplateBaseProps } from './sharedTypes';

const DEFAULT_SLOT = { photoUri: null, transform: { scale: 1, translateX: 0, translateY: 0 }, resetKey: 0, entry: null };

const C03TwoByTwoTemplate = React.forwardRef<View, TemplateBaseProps>(
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
    const chromeSize = Math.max(12, Math.round(20 * clampedScale));
    const emptyIconSize = Math.max(14, Math.round(22 * clampedScale));

    const renderCell = (index: number) => {
      const slotData = slots[index] ?? DEFAULT_SLOT;
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
                  style={[st.chromeBtn, { width: s(28), height: s(28), borderRadius: s(14) }]}
                  onPress={() => onResetSlotFraming?.(index)}
                  hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                  accessibilityRole="button"
                  accessibilityLabel={`Reset photo ${index + 1} framing`}
                >
                  <Ionicons name="refresh-outline" size={chromeSize} color="rgba(255,255,255,0.9)" />
                </TouchableOpacity>
                <TouchableOpacity
                  style={[st.chromeBtn, { width: s(28), height: s(28), borderRadius: s(14) }]}
                  onPress={() => onSlotPress?.(index)}
                  hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
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
          {!previewMode && <AppText style={{ color: '#555', fontSize: s(10) }}>Tap to add</AppText>}
        </TouchableOpacity>
      );
    };

    return (
      <View ref={ref} collapsable={false} style={[st.container, { aspectRatio }]}>
        <View style={st.row}>
          {renderCell(0)}
          {renderCell(1)}
        </View>
        <View style={st.row}>
          {renderCell(2)}
          {renderCell(3)}
        </View>
      </View>
    );
  }
);

C03TwoByTwoTemplate.displayName = 'C03TwoByTwoTemplate';

export default C03TwoByTwoTemplate;

const st = StyleSheet.create({
  container: {
    backgroundColor: '#000',
    overflow: 'hidden',
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
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
