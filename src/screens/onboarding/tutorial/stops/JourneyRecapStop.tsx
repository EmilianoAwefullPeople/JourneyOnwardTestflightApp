// TODO(phase2): Re-skin this component in Trip-in-Review visual format

import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import AppText from '../../../../components/common/AppText';
import { useTheme } from '../../../../context/ThemeContext';
import { FONTS, FONT_WEIGHTS, SPACING } from '../../../../config/constants';

interface Props {
  onNext: () => void;
  onTry?: () => void;
  /** When false, the user has no eligible album yet — show the placeholder copy instead. */
  hasEligibleAlbum: boolean;
}

const JourneyRecapStop: React.FC<Props> = ({ onNext, onTry, hasEligibleAlbum }) => {
  const { colors } = useTheme();
  return (
    <View style={styles.container}>
      <AppText style={[styles.title, { color: colors.textPrimary }]}>Your trip, turned into a story</AppText>
      <AppText style={[styles.body, { color: colors.textSecondary }]}>
        Journey Recap generates a video recap of your trip — with stats, highlights, and memories from your album. It's the closest thing to reliving the experience. Generated automatically once a trip album is complete.
      </AppText>
      {/* TODO(future): Replace with produced demo video */}
      <View style={styles.actions}>
        {hasEligibleAlbum && onTry ? (
          <TouchableOpacity style={[styles.tryBtn, { backgroundColor: colors.textPrimary }]} onPress={onTry} activeOpacity={0.85}>
            <AppText style={[styles.tryText, { color: colors.background }]}>See your recap</AppText>
          </TouchableOpacity>
        ) : (
          <View style={[styles.placeholder, { backgroundColor: colors.surfaceVariant, borderColor: colors.border }]}>
            <AppText style={[styles.placeholderText, { color: colors.textSecondary }]}>
              Finish a trip album and come back to this — it's worth it.
            </AppText>
          </View>
        )}
        <TouchableOpacity onPress={onNext} style={styles.skipLink}>
          <AppText style={[styles.skipText, { color: colors.textSecondary }]}>Got it</AppText>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', paddingHorizontal: SPACING.lg, gap: SPACING.xl },
  title: { fontFamily: FONTS.inter, fontSize: 28, fontWeight: FONT_WEIGHTS.bold, lineHeight: 36 },
  body: { fontFamily: FONTS.inter, fontSize: 16, lineHeight: 26 },
  actions: { gap: SPACING.md },
  tryBtn: { height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  tryText: { color: '#fff', fontFamily: FONTS.inter, fontSize: 16, fontWeight: FONT_WEIGHTS.semibold },
  placeholder: {
    borderRadius: 14,
    borderWidth: 1,
    padding: SPACING.lg,
  },
  placeholderText: { fontFamily: FONTS.inter, fontSize: 15, lineHeight: 22, textAlign: 'center' },
  skipLink: { alignSelf: 'center' },
  skipText: { fontFamily: FONTS.inter, fontSize: 14 },
});

export default JourneyRecapStop;
