import React, { useMemo } from 'react';
import { View, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AppText from '../../common/AppText';
import { FONTS } from '../../../config/constants';
import type { PostcardPhotoTransform } from '../../../models/Postcard';
import { PostcardFramedPhotoSlot } from '../PostcardFramedPhotoSlot';

/** Classic film-subtitle yellow (brighter than gold). */
const SUBTITLE_YELLOW = '#FFE600';
const SUBTITLE_YELLOW_MUTED = 'rgba(255, 230, 0, 0.4)';
/** Helvetica Medium Italic on iOS; Inter italic elsewhere. */
const SUBTITLE_FONT = Platform.OS === 'ios' ? 'Helvetica' : FONTS.inter;

interface Props {
  topPhoto: string | null;
  bottomPhoto: string | null;
  onSlotPress: (slot: 'top' | 'bottom') => void;
  onLabelPress: (slot: 'top' | 'bottom') => void;
  onResetSlotFraming: (slot: 'top' | 'bottom') => void;
  topLabel: string;
  bottomLabel: string;
  topTransform: PostcardPhotoTransform;
  bottomTransform: PostcardPhotoTransform;
  onTopTransformChange: (t: PostcardPhotoTransform) => void;
  onBottomTransformChange: (t: PostcardPhotoTransform) => void;
  topResetKey?: number;
  bottomResetKey?: number;
  aspectRatio?: number;
  /** When true, swap/reset controls are hidden (e.g. while capturing to camera roll). */
  editingChromeSuppressed?: boolean;
  /** Read-only postcard rendering for gallery thumbnails. */
  previewMode?: boolean;
  /** Hide caption bands in contexts where labels should not be visible. */
  hideSlotLabels?: boolean;
  /** Scales fixed template internals for thumbnail rendering. */
  scale?: number;
}

const T11DiptychTemplate = React.forwardRef<View, Props>(
  (
    {
      topPhoto,
      bottomPhoto,
      onSlotPress,
      onLabelPress,
      onResetSlotFraming,
      topLabel,
      bottomLabel,
      topTransform,
      bottomTransform,
      onTopTransformChange,
      onBottomTransformChange,
      topResetKey,
      bottomResetKey,
      aspectRatio = 4 / 5,
      editingChromeSuppressed = false,
      previewMode = false,
      hideSlotLabels = false,
      scale = 1,
    },
    ref
  ) => {
    const clampedScale = Math.max(0.3, Math.min(1, scale));
    const scaledStyles = useMemo(() => {
      const s = (value: number): number => Math.max(1, Math.round(value * clampedScale));
      return StyleSheet.create({
        // Edge-to-edge two-row grid — no border radius (would bake rounded corners into
        // the exported image) and no outer padding (matches the plain collage grids).
        container: {
          backgroundColor: '#000',
        },
        photoSlot: {
          flex: 1,
          overflow: 'hidden',
          backgroundColor: '#1a1a1a',
          position: 'relative',
        },
        slotChrome: {
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          paddingHorizontal: s(6),
          paddingTop: s(6),
          zIndex: 3,
        },
        slotChromeHidden: {
          opacity: 0,
        },
        chromeButton: {
          width: s(36),
          height: s(36),
          borderRadius: s(18),
          backgroundColor: 'rgba(0,0,0,0.45)',
          alignItems: 'center',
          justifyContent: 'center',
        },
        // Cinematic subtitle band — bottom-centered, with breathing room from the edge.
        textBand: {
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          paddingBottom: s(14),
          paddingTop: s(8),
          paddingHorizontal: s(16),
          zIndex: 4,
        },
        labelText: {
          color: SUBTITLE_YELLOW,
          fontFamily: SUBTITLE_FONT,
          fontSize: s(14),
          fontWeight: '500',
          fontStyle: 'italic',
          textAlign: 'center',
          letterSpacing: 0.2,
          textShadowColor: 'rgba(0,0,0,0.85)',
          textShadowOffset: { width: 0, height: 1 },
          textShadowRadius: 3,
        },
        labelPlaceholder: {
          color: SUBTITLE_YELLOW_MUTED,
          fontFamily: SUBTITLE_FONT,
          fontSize: s(14),
          fontWeight: '500',
          fontStyle: 'italic',
          textAlign: 'center',
          letterSpacing: 0.2,
        },
        emptySlot: {
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          gap: s(8),
        },
        emptyText: {
          color: '#555',
          fontSize: s(12),
          fontWeight: '500',
        },
      });
    }, [clampedScale]);

    const chromeIconSize = Math.max(12, Math.round(22 * clampedScale));
    const emptyIconSize = Math.max(16, Math.round(28 * clampedScale));

    const renderSlot = (
      photo: string | null,
      label: string,
      slot: 'top' | 'bottom',
      transform: PostcardPhotoTransform,
      onTransformChange: (t: PostcardPhotoTransform) => void,
      slotResetKey: number | undefined
    ) => (
      <View style={scaledStyles.photoSlot}>
        {photo ? (
          <>
            <PostcardFramedPhotoSlot
              uri={photo}
              transform={transform}
              onTransformChange={onTransformChange}
              resetKey={slotResetKey}
              interactionEnabled={!previewMode}
            />

            {!previewMode && (
              <View
                style={[
                  scaledStyles.slotChrome,
                  editingChromeSuppressed && scaledStyles.slotChromeHidden,
                ]}
                pointerEvents={editingChromeSuppressed ? 'none' : 'box-none'}
              >
                <TouchableOpacity
                  style={scaledStyles.chromeButton}
                  onPress={() => onResetSlotFraming(slot)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  accessibilityRole="button"
                  accessibilityLabel={`Reset ${slot} photo framing`}
                >
                  <Ionicons
                    name="refresh-outline"
                    size={chromeIconSize}
                    color="rgba(255,255,255,0.92)"
                  />
                </TouchableOpacity>
                <TouchableOpacity
                  style={scaledStyles.chromeButton}
                  onPress={() => onSlotPress(slot)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  accessibilityRole="button"
                  accessibilityLabel={`Change ${slot} photo`}
                >
                  <Ionicons
                    name="images-outline"
                    size={chromeIconSize}
                    color="rgba(255,255,255,0.92)"
                  />
                </TouchableOpacity>
              </View>
            )}

            {!hideSlotLabels &&
              (previewMode
                ? // Read-only contexts (recap cards, saved-postcard thumbnails): never show a
                  // placeholder invitation — only render the band when there's a real caption.
                  label && (
                    <View style={scaledStyles.textBand}>
                      <AppText style={scaledStyles.labelText}>{label.toLowerCase()}</AppText>
                    </View>
                  )
                : (
                  <TouchableOpacity
                    style={scaledStyles.textBand}
                    onPress={() => onLabelPress(slot)}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityLabel={`Edit ${slot} caption`}
                  >
                    <AppText style={label ? scaledStyles.labelText : scaledStyles.labelPlaceholder}>
                      {label ? label.toLowerCase() : 'add caption...'}
                    </AppText>
                  </TouchableOpacity>
                ))}
          </>
        ) : previewMode ? (
          <View style={scaledStyles.emptySlot}>
            <Ionicons name="image-outline" size={emptyIconSize} color="#555" />
            <AppText style={scaledStyles.emptyText}>No photo</AppText>
          </View>
        ) : (
          <TouchableOpacity
            style={scaledStyles.emptySlot}
            onPress={() => onSlotPress(slot)}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={`Add ${slot} photo`}
          >
            <Ionicons name="image-outline" size={emptyIconSize} color="#555" />
            <AppText style={scaledStyles.emptyText}>Tap to add photo</AppText>
          </TouchableOpacity>
        )}
      </View>
    );

    return (
      <View ref={ref} collapsable={false} style={[scaledStyles.container, { aspectRatio }]}>
        {renderSlot(topPhoto, topLabel, 'top', topTransform, onTopTransformChange, topResetKey)}
        {renderSlot(
          bottomPhoto,
          bottomLabel,
          'bottom',
          bottomTransform,
          onBottomTransformChange,
          bottomResetKey
        )}
      </View>
    );
  }
);

T11DiptychTemplate.displayName = 'T11DiptychTemplate';

export default T11DiptychTemplate;
