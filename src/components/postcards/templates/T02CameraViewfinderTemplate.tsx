import React from 'react';
import { View, Image, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AppText from '../../common/AppText';
import { PostcardFramedPhotoSlot } from '../PostcardFramedPhotoSlot';
import type { TemplateBaseProps } from './sharedTypes';
import {
  formatCameraDate,
  formatTime,
  entryDestination,
  entryTempString,
} from './sharedTypes';
import { FONTS } from '../../../config/constants';

const T02CameraViewfinderTemplate = React.forwardRef<View, TemplateBaseProps>(
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
    const dateStr = formatCameraDate(slot0.entry?.timestamp);
    const timeStr = formatTime(slot0.entry?.timestamp);
    const location = entryDestination(slot0.entry);
    const tempStr = entryTempString(slot0.entry) ?? '';
    const chromeSize = Math.max(12, Math.round(22 * clampedScale));
    const emptyIconSize = Math.max(16, Math.round(28 * clampedScale));
    const bracketLen = s(20);
    const bracketThick = s(2);

    const bracketColor = 'rgba(255,255,255,0.75)';

    const topBarHeight = s(36);
    const bottomStripHeight = s(52);

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

        {/* Top bar */}
        <View style={[st.topBar, { height: topBarHeight, paddingHorizontal: s(10) }]}>
          <AppText style={{ fontFamily: FONTS.mono, fontSize: s(11), color: '#fff' }}>
            {'[///]  4:3  16M'}
          </AppText>
          {tempStr ? (
            <View style={[st.expoBadge, { paddingHorizontal: s(6), paddingVertical: s(2), borderRadius: s(3) }]}>
              <AppText style={{ fontFamily: FONTS.mono, fontSize: s(11), color: '#fff' }}>
                {tempStr}
              </AppText>
            </View>
          ) : null}
        </View>

        {/* Corner brackets */}
        {/* Top-left */}
        <View style={[st.bracketTL, { top: topBarHeight + s(8), left: s(8) }]}>
          <View style={{ position: 'absolute', top: 0, left: 0, width: bracketLen, height: bracketThick, backgroundColor: bracketColor }} />
          <View style={{ position: 'absolute', top: 0, left: 0, width: bracketThick, height: bracketLen, backgroundColor: bracketColor }} />
        </View>
        {/* Top-right */}
        <View style={[st.bracketTR, { top: topBarHeight + s(8), right: s(8) }]}>
          <View style={{ position: 'absolute', top: 0, right: 0, width: bracketLen, height: bracketThick, backgroundColor: bracketColor }} />
          <View style={{ position: 'absolute', top: 0, right: 0, width: bracketThick, height: bracketLen, backgroundColor: bracketColor }} />
        </View>
        {/* Bottom-left */}
        <View style={[st.bracketBL, { bottom: bottomStripHeight + s(8), left: s(8) }]}>
          <View style={{ position: 'absolute', bottom: 0, left: 0, width: bracketLen, height: bracketThick, backgroundColor: bracketColor }} />
          <View style={{ position: 'absolute', bottom: 0, left: 0, width: bracketThick, height: bracketLen, backgroundColor: bracketColor }} />
        </View>
        {/* Bottom-right */}
        <View style={[st.bracketBR, { bottom: bottomStripHeight + s(8), right: s(8) }]}>
          <View style={{ position: 'absolute', bottom: 0, right: 0, width: bracketLen, height: bracketThick, backgroundColor: bracketColor }} />
          <View style={{ position: 'absolute', bottom: 0, right: 0, width: bracketThick, height: bracketLen, backgroundColor: bracketColor }} />
        </View>

        {/* Bottom strip */}
        <View style={[st.bottomStrip, { height: bottomStripHeight, paddingHorizontal: s(10), paddingVertical: s(5), gap: s(2) }]}>
          <AppText style={{ fontFamily: FONTS.mono, fontSize: s(10), color: '#fff' }}>
            {'001  '}{dateStr}{'  '}{timeStr}
          </AppText>
          {location ? (
            <AppText style={{ fontFamily: FONTS.mono, fontSize: s(11), color: '#fff' }} numberOfLines={1}>
              {location}
            </AppText>
          ) : null}
          <AppText style={{ fontFamily: FONTS.mono, fontSize: s(9), color: 'rgba(255,255,255,0.6)' }}>
            DOCUMENTED WITH JOURNEY ONWARD
          </AppText>
        </View>

        {/* Edit chrome overlay */}
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

T02CameraViewfinderTemplate.displayName = 'T02CameraViewfinderTemplate';

export default T02CameraViewfinderTemplate;

const st = StyleSheet.create({
  container: {
    backgroundColor: '#000',
    overflow: 'hidden',
    position: 'relative',
  },
  emptySlot: {
    flex: 1,
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#1a1a1a',
  },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.55)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    zIndex: 5,
  },
  expoBadge: {
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  bracketTL: { position: 'absolute', width: 20, height: 20, zIndex: 5 },
  bracketTR: { position: 'absolute', width: 20, height: 20, zIndex: 5 },
  bracketBL: { position: 'absolute', width: 20, height: 20, zIndex: 5 },
  bracketBR: { position: 'absolute', width: 20, height: 20, zIndex: 5 },
  bottomStrip: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center',
    zIndex: 5,
  },
  editChrome: {
    position: 'absolute',
    top: 40,
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
