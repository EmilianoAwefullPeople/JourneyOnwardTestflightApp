import React from 'react';
import { View, Image, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AppText from '../../common/AppText';
import { PostcardFramedPhotoSlot } from '../PostcardFramedPhotoSlot';
import type { TemplateBaseProps } from './sharedTypes';
import { entryDestination } from './sharedTypes';
import { FONTS } from '../../../config/constants';

const T03StatementCardTemplate = React.forwardRef<View, TemplateBaseProps>(
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
    const destination = entryDestination(slot0.entry);
    const chromeSize = Math.max(12, Math.round(22 * clampedScale));
    const emptyIconSize = Math.max(16, Math.round(28 * clampedScale));

    const statementText = `IF YOU'RE\nREADING THIS\nI WAS IN\n${destination ? destination.toUpperCase() : 'A PLACE FAR AWAY'}`;

    return (
      <View ref={ref} collapsable={false} style={[st.container, { aspectRatio }]}>
        {/* Full-bleed photo */}
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
            style={st.emptySlot}
            onPress={() => !previewMode && onSlotPress?.(0)}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Add photo"
          >
            <Ionicons name="image-outline" size={emptyIconSize} color="#555" />
            {!previewMode && <AppText style={{ color: '#555', fontSize: s(12) }}>Tap to add photo</AppText>}
          </TouchableOpacity>
        )}

        {/* Semi-transparent overlay gradient for text legibility */}
        <View style={st.overlay} pointerEvents="none" />

        {/* Statement text overlay */}
        <View style={[st.textOverlay, { paddingHorizontal: s(24) }]} pointerEvents="none">
          <AppText
            style={{
              fontFamily: FONTS.permanentMarker,
              fontSize: s(38),
              color: '#fff',
              textShadowColor: 'rgba(0,0,0,0.6)',
              textShadowOffset: { width: 2, height: 2 },
              textShadowRadius: 4,
              textAlign: 'left',
              lineHeight: s(46),
            }}
          >
            {statementText}
          </AppText>
        </View>

        {/* Brand mark */}
        {!editingChromeSuppressed && (
          <AppText
            style={[st.brandMark, { fontSize: s(11), bottom: s(14), right: s(14) }]}
            pointerEvents="none"
          >
            Journey Onward
          </AppText>
        )}

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

T03StatementCardTemplate.displayName = 'T03StatementCardTemplate';

export default T03StatementCardTemplate;

const st = StyleSheet.create({
  container: {
    backgroundColor: '#000',
    overflow: 'hidden',
    position: 'relative',
  },
  emptySlot: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#1a1a1a',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.18)',
    zIndex: 2,
  },
  textOverlay: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'flex-start',
    justifyContent: 'center',
    zIndex: 3,
  },
  brandMark: {
    position: 'absolute',
    fontFamily: 'Inter',
    fontStyle: 'italic',
    color: 'rgba(255,255,255,0.6)',
    zIndex: 4,
  },
  editChrome: {
    position: 'absolute',
    top: 12,
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
