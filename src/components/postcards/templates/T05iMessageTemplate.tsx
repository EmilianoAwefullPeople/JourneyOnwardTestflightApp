import React from 'react';
import { View, Image, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AppText from '../../common/AppText';
import { PostcardFramedPhotoSlot } from '../PostcardFramedPhotoSlot';
import type { TemplateBaseProps } from './sharedTypes';
import { formatLongDate, formatTime, entryDestination } from './sharedTypes';
import { FONTS } from '../../../config/constants';

const T05iMessageTemplate = React.forwardRef<View, TemplateBaseProps>(
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

    const chromeSize = Math.max(12, Math.round(20 * clampedScale));
    const emptyIconSize = Math.max(14, Math.round(22 * clampedScale));

    const now = new Date();
    const entryDate = slot0.entry?.timestamp ? new Date(slot0.entry.timestamp) : null;
    const isToday = entryDate && now.toDateString() === entryDate.toDateString();
    const timeStr = formatTime(slot0.entry?.timestamp) || formatTime(now.toISOString());
    const timestampText = isToday
      ? `Today ${timeStr}`
      : `${formatLongDate(slot0.entry?.timestamp) || 'Today'} ${timeStr}`;

    const destination = entryDestination(slot0.entry);
    const msgText = destination ? `Exploring ${destination}.` : 'Still exploring.';

    const renderPhotoSlot = (
      slotData: typeof slot0,
      index: number,
      opts: { widthPct: number; rotate: string; marginTop?: number }
    ) => {
      const photoStyle = {
        width: `${opts.widthPct}%` as const,
        aspectRatio: 4 / 5,
        borderRadius: s(18),
        overflow: 'hidden' as const,
        alignSelf: 'flex-end' as const,
        marginTop: opts.marginTop ?? 0,
        transform: [{ rotate: opts.rotate }],
        shadowColor: '#000',
        shadowOpacity: 0.3,
        shadowRadius: s(8),
        shadowOffset: { width: 0, height: s(3) },
        elevation: 4,
      };

      if (slotData.photoUri) {
        return (
          <View style={photoStyle} key={index}>
            {previewMode || editingChromeSuppressed ? (
              <Image source={{ uri: slotData.photoUri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
            ) : (
              <>
                <PostcardFramedPhotoSlot
                  uri={slotData.photoUri}
                  transform={slotData.transform}
                  onTransformChange={(t) => onTransformChange?.(index, t)}
                  resetKey={slotData.resetKey}
                  interactionEnabled={!previewMode}
                />
                {!editingChromeSuppressed && (
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
              </>
            )}
          </View>
        );
      }

      return (
        <TouchableOpacity
          key={index}
          style={[
            photoStyle,
            { backgroundColor: '#2a2a2a', alignItems: 'center', justifyContent: 'center', gap: 4 },
          ]}
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
        <AppText style={[st.timestamp, { fontSize: s(12), marginTop: s(14), marginBottom: s(10) }]}>
          {timestampText}
        </AppText>

        <View style={[st.photosArea, { paddingHorizontal: s(12) }]}>
          {renderPhotoSlot(slot0, 0, { widthPct: 68, rotate: '3deg' })}
          {slot1.photoUri || !previewMode
            ? renderPhotoSlot(slot1, 1, { widthPct: 62, rotate: '-4deg', marginTop: s(-28) })
            : null}
        </View>

        <View style={[st.msgRow, { paddingHorizontal: s(12), marginTop: s(10) }]}>
          <View style={[st.blueBubble, { borderRadius: s(18), paddingHorizontal: s(14), paddingVertical: s(10) }]}>
            <AppText style={{ fontFamily: FONTS.inter, fontSize: s(15), color: '#fff', fontWeight: '400' }}>
              {msgText}
            </AppText>
          </View>
        </View>

        <AppText style={[st.status, { fontSize: s(11), marginTop: s(4), marginRight: s(14), marginBottom: s(12) }]}>
          Delivered
        </AppText>
      </View>
    );
  }
);

T05iMessageTemplate.displayName = 'T05iMessageTemplate';

export default T05iMessageTemplate;

const st = StyleSheet.create({
  container: {
    backgroundColor: '#000',
    overflow: 'hidden',
    flexDirection: 'column',
  },
  timestamp: {
    textAlign: 'center',
    color: '#8E8E93',
    fontFamily: FONTS.inter,
    fontWeight: '400',
  },
  photosArea: {
    flex: 1,
    flexDirection: 'column',
    justifyContent: 'flex-end',
    alignItems: 'stretch',
  },
  msgRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  blueBubble: {
    backgroundColor: '#007AFF',
    maxWidth: '75%',
  },
  status: {
    color: '#8E8E93',
    fontFamily: FONTS.inter,
    fontWeight: '400',
    textAlign: 'right',
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
});
