import React from 'react';
import { View, Image, TouchableOpacity, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import AppText from '../../common/AppText';
import { PostcardFramedPhotoSlot } from '../PostcardFramedPhotoSlot';
import type { TemplateBaseProps } from './sharedTypes';
import { FONTS } from '../../../config/constants';
import { getLocationTagContent } from './locationTagUtils';

const T04LocationTagTemplate = React.forwardRef<View, TemplateBaseProps>(
  (
    {
      slots,
      onSlotPress,
      onTransformChange,
      onResetSlotFraming,
      templateData,
      aspectRatio = 4 / 5,
      editingChromeSuppressed = false,
      previewMode = false,
      scale = 1,
    },
    ref
  ) => {
    const clampedScale = Math.max(0.3, Math.min(1, scale));
    const s = (v: number) => Math.max(1, Math.round(v * clampedScale));

    const defaultSlot = { photoUri: null, transform: { scale: 1, translateX: 0, translateY: 0 }, resetKey: 0, entry: null };
    // slot0 is the smaller foreground photo (drives the location/date tag); slot1 is the full-bleed background.
    const foreground = slots[0] ?? defaultSlot;
    const background = slots[1] ?? defaultSlot;

    const chromeSize = Math.max(12, Math.round(20 * clampedScale));
    const emptyIconSize = Math.max(14, Math.round(24 * clampedScale));

    const tag = getLocationTagContent(foreground.entry, templateData);

    return (
      <View ref={ref} collapsable={false} style={[st.container, { aspectRatio }]}>
        {/* Background layer */}
        {background.photoUri ? (
          previewMode ? (
            <Image source={{ uri: background.photoUri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
          ) : (
            <View style={StyleSheet.absoluteFill}>
              <PostcardFramedPhotoSlot
                uri={background.photoUri}
                transform={background.transform}
                onTransformChange={(t) => onTransformChange?.(1, t)}
                resetKey={background.resetKey}
                interactionEnabled={!previewMode}
              />
            </View>
          )
        ) : (
          <LinearGradient colors={['#2C2C2E', '#1A1A1C']} style={StyleSheet.absoluteFill} />
        )}

        {!background.photoUri && !previewMode && (
          <TouchableOpacity
            style={[
              st.addBgBtn,
              { bottom: s(14), left: s(14), borderRadius: s(16), paddingHorizontal: s(12), paddingVertical: s(8) },
            ]}
            onPress={() => onSlotPress?.(1)}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Add background photo"
          >
            <Ionicons name="image-outline" size={s(14)} color="rgba(255,255,255,0.85)" />
            <AppText style={{ color: 'rgba(255,255,255,0.85)', fontSize: s(11), marginLeft: s(4) }}>
              Background
            </AppText>
          </TouchableOpacity>
        )}

        {background.photoUri && !previewMode && !editingChromeSuppressed && (
          <View style={[st.bgChrome, { top: s(10), right: s(10) }]} pointerEvents="box-none">
            <TouchableOpacity
              style={[st.chromeBtn, { width: s(28), height: s(28), borderRadius: s(14) }]}
              onPress={() => onResetSlotFraming?.(1)}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
              accessibilityRole="button"
              accessibilityLabel="Reset background framing"
            >
              <Ionicons name="refresh-outline" size={chromeSize} color="rgba(255,255,255,0.9)" />
            </TouchableOpacity>
            <TouchableOpacity
              style={[st.chromeBtn, { width: s(28), height: s(28), borderRadius: s(14), marginLeft: s(6) }]}
              onPress={() => onSlotPress?.(1)}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
              accessibilityRole="button"
              accessibilityLabel="Change background photo"
            >
              <Ionicons name="images-outline" size={chromeSize} color="rgba(255,255,255,0.9)" />
            </TouchableOpacity>
          </View>
        )}

        {/* Foreground photo card (unclipped wrapper so the tag can hang off its corner) */}
        <View
          style={[
            st.foregroundWrapper,
            {
              top: '30%',
              left: '6%',
              width: '88%',
              aspectRatio: 4 / 3,
              shadowRadius: s(14),
              shadowOffset: { width: 0, height: s(6) },
            },
          ]}
        >
          <View style={[st.foregroundClip, { borderRadius: s(6) }]}>
            {foreground.photoUri ? (
              <>
                {previewMode ? (
                  <Image source={{ uri: foreground.photoUri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                ) : (
                  <PostcardFramedPhotoSlot
                    uri={foreground.photoUri}
                    transform={foreground.transform}
                    onTransformChange={(t) => onTransformChange?.(0, t)}
                    resetKey={foreground.resetKey}
                    interactionEnabled={!previewMode}
                  />
                )}
                {!previewMode && !editingChromeSuppressed && (
                  <View style={st.fgChrome} pointerEvents="box-none">
                    <TouchableOpacity
                      style={[st.chromeBtn, { width: s(28), height: s(28), borderRadius: s(14) }]}
                      onPress={() => onResetSlotFraming?.(0)}
                      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                      accessibilityRole="button"
                      accessibilityLabel="Reset photo framing"
                    >
                      <Ionicons name="refresh-outline" size={chromeSize} color="rgba(255,255,255,0.9)" />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[st.chromeBtn, { width: s(28), height: s(28), borderRadius: s(14) }]}
                      onPress={() => onSlotPress?.(0)}
                      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                      accessibilityRole="button"
                      accessibilityLabel="Change photo"
                    >
                      <Ionicons name="images-outline" size={chromeSize} color="rgba(255,255,255,0.9)" />
                    </TouchableOpacity>
                  </View>
                )}
              </>
            ) : (
              <TouchableOpacity
                style={st.emptyForeground}
                onPress={() => !previewMode && onSlotPress?.(0)}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel="Add photo"
              >
                <Ionicons name="image-outline" size={emptyIconSize} color="#555" />
                {!previewMode && <AppText style={{ color: '#555', fontSize: s(11) }}>Tap to add photo</AppText>}
              </TouchableOpacity>
            )}
          </View>

          {tag.text ? (
            <View
              style={[
                st.tagShadow,
                {
                  bottom: s(-14),
                  right: s(14),
                  borderRadius: s(16),
                  shadowOffset: { width: 0, height: s(3) },
                  shadowRadius: s(8),
                },
              ]}
              pointerEvents="none"
            >
              <View style={[st.tagClip, { borderRadius: s(16) }]}>
                <BlurView intensity={36} tint="dark" style={StyleSheet.absoluteFill} />
                <View style={st.tagScrim} />
                <View
                  style={[
                    st.tagContent,
                    { paddingHorizontal: s(12), paddingVertical: s(7), gap: s(5) },
                  ]}
                >
                  <Ionicons name={tag.icon} size={s(12)} color="rgba(255,255,255,0.92)" />
                  <AppText
                    style={{
                      fontFamily: FONTS.inter,
                      fontWeight: '500',
                      fontSize: s(12),
                      color: 'rgba(255,255,255,0.94)',
                      letterSpacing: 0.15,
                    }}
                    numberOfLines={1}
                  >
                    {tag.text}
                  </AppText>
                </View>
              </View>
            </View>
          ) : null}
        </View>
      </View>
    );
  }
);

T04LocationTagTemplate.displayName = 'T04LocationTagTemplate';

export default T04LocationTagTemplate;

const st = StyleSheet.create({
  container: {
    backgroundColor: '#000',
    overflow: 'hidden',
    position: 'relative',
  },
  addBgBtn: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.45)',
    zIndex: 3,
  },
  bgChrome: {
    position: 'absolute',
    flexDirection: 'row',
    zIndex: 10,
  },
  foregroundWrapper: {
    position: 'absolute',
    shadowColor: '#000',
    shadowOpacity: 0.35,
    elevation: 8,
    zIndex: 5,
  },
  foregroundClip: {
    flex: 1,
    overflow: 'hidden',
    backgroundColor: '#1a1a1a',
    position: 'relative',
  },
  emptyForeground: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  fgChrome: {
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
  tagShadow: {
    position: 'absolute',
    transform: [{ rotate: '-3deg' }],
    shadowColor: '#000',
    shadowOpacity: 0.2,
    elevation: 5,
    zIndex: 6,
  },
  tagClip: {
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.22)',
  },
  tagScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.12)',
  },
  tagContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});
