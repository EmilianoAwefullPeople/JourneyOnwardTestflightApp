import React from 'react';
import { View, Image, TouchableOpacity, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Rect, Text as SvgText, Circle } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import AppText from '../../common/AppText';
import { PostcardFramedPhotoSlot } from '../PostcardFramedPhotoSlot';
import type { TemplateBaseProps } from './sharedTypes';
import { FONTS } from '../../../config/constants';

const T04LayeredScrapbookTemplate = React.forwardRef<View, TemplateBaseProps>(
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

    const chromeSize = Math.max(12, Math.round(20 * clampedScale));
    const emptyIconSize = Math.max(14, Math.round(22 * clampedScale));
    const stampW = s(90);
    const stampH = s(110);
    const stampMargin = s(20);

    const renderPhotoCard = (
      slotData: typeof slot0,
      index: number,
      cardStyle: object,
      innerStyle: object
    ) => {
      return (
        <View style={[st.card, cardStyle, { padding: s(10) }]}>
          {slotData.photoUri ? (
            <View style={[st.cardInner, innerStyle]}>
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
                <View style={st.cardChrome} pointerEvents="box-none">
                  <TouchableOpacity
                    style={[st.chromeBtn, { width: s(28), height: s(28), borderRadius: s(14) }]}
                    onPress={() => onResetSlotFraming?.(index)}
                    hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                    accessibilityRole="button"
                    accessibilityLabel={`Reset slot ${index + 1} framing`}
                  >
                    <Ionicons name="refresh-outline" size={chromeSize} color="rgba(255,255,255,0.9)" />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[st.chromeBtn, { width: s(28), height: s(28), borderRadius: s(14) }]}
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
          ) : (
            <TouchableOpacity
              style={[st.cardInner, innerStyle, st.emptyCardInner]}
              onPress={() => !previewMode && onSlotPress?.(index)}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={`Add photo ${index + 1}`}
            >
              <Ionicons name="image-outline" size={emptyIconSize} color="#555" />
              {!previewMode && <AppText style={{ color: '#555', fontSize: s(10) }}>Tap to add</AppText>}
            </TouchableOpacity>
          )}
        </View>
      );
    };

    return (
      <View ref={ref} collapsable={false} style={[st.container, { aspectRatio }]}>
        {/* Background: bg photo or gradient */}
        {slot2.photoUri ? (
          <>
            <Image source={{ uri: slot2.photoUri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
            <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.35)' }]} />
          </>
        ) : (
          <LinearGradient
            colors={['#2C4A2E', '#1A2E4A']}
            style={StyleSheet.absoluteFill}
          />
        )}

        {/* Add bg photo button */}
        {!slot2.photoUri && !previewMode && (
          <TouchableOpacity
            style={[st.addBgBtn, { bottom: s(20), left: s(12) }]}
            onPress={() => onSlotPress?.(2)}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Add background photo"
          >
            <AppText style={{ color: 'rgba(255,255,255,0.6)', fontSize: s(10) }}>+ bg photo</AppText>
          </TouchableOpacity>
        )}

        {/* Card 1: slot0 */}
        {renderPhotoCard(
          slot0,
          0,
          {
            position: 'absolute',
            top: '8%',
            left: '6%',
            width: '58%',
            aspectRatio: 4 / 5,
            transform: [{ rotate: '-3deg' }],
          },
          { flex: 1, overflow: 'hidden' }
        )}

        {/* Card 2: slot1 */}
        {renderPhotoCard(
          slot1,
          1,
          {
            position: 'absolute',
            top: '34%',
            right: '5%',
            width: '58%',
            aspectRatio: 4 / 5,
            transform: [{ rotate: '2.5deg' }],
          },
          { flex: 1, overflow: 'hidden' }
        )}

        {/* Postage stamp SVG */}
        <View
          style={{
            position: 'absolute',
            bottom: stampMargin,
            right: stampMargin,
            zIndex: 10,
          }}
          pointerEvents="none"
        >
          <Svg width={stampW} height={stampH}>
            {/* Outer perforated border */}
            <Rect
              x={2}
              y={2}
              width={stampW - 4}
              height={stampH - 4}
              fill="#4A6B3E"
              stroke="#E8DCC8"
              strokeWidth={3}
              strokeDasharray="4 3"
            />
            {/* Inner cream rectangle */}
            <Rect
              x={10}
              y={10}
              width={stampW - 20}
              height={stampH - 20}
              fill="#E8DCC8"
            />
            {/* Decorative circle */}
            <Circle
              cx={stampW / 2}
              cy={28}
              r={8}
              fill="#4A6B3E"
            />
            {/* Text lines */}
            <SvgText
              x={stampW / 2}
              y={50}
              textAnchor="middle"
              fontSize={9}
              fontFamily={FONTS.inter}
              fontWeight="700"
              fill="#2C4A2E"
              letterSpacing={1}
            >
              JOURNEY
            </SvgText>
            <SvgText
              x={stampW / 2}
              y={64}
              textAnchor="middle"
              fontSize={9}
              fontFamily={FONTS.inter}
              fontWeight="700"
              fill="#2C4A2E"
              letterSpacing={1}
            >
              ONWARD
            </SvgText>
            <SvgText
              x={stampW / 2}
              y={82}
              textAnchor="middle"
              fontSize={8}
              fontFamily={FONTS.inter}
              fontWeight="700"
              fill="#4A6B3E"
              letterSpacing={2}
            >
              TRAVELER
            </SvgText>
          </Svg>
        </View>
      </View>
    );
  }
);

T04LayeredScrapbookTemplate.displayName = 'T04LayeredScrapbookTemplate';

export default T04LayeredScrapbookTemplate;

const st = StyleSheet.create({
  container: {
    overflow: 'hidden',
    backgroundColor: '#1A2E4A',
    position: 'relative',
  },
  card: {
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
    zIndex: 5,
  },
  cardInner: {
    flex: 1,
    overflow: 'hidden',
  },
  emptyCardInner: {
    backgroundColor: '#e8e8e8',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  cardChrome: {
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
  addBgBtn: {
    position: 'absolute',
    zIndex: 2,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: 'rgba(0,0,0,0.4)',
    borderRadius: 4,
  },
});
