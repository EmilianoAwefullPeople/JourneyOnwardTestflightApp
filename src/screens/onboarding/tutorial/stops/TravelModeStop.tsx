// TODO(phase2): Re-skin this component in Trip-in-Review visual format

import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import AppText from '../../../../components/common/AppText';
import { useTheme } from '../../../../context/ThemeContext';
import { FONTS, FONT_WEIGHTS, SPACING } from '../../../../config/constants';

interface Props {
  onNext: () => void;
  onTry: () => void;
}

const TravelModeStop: React.FC<Props> = ({ onNext, onTry }) => {
  const { colors } = useTheme();
  return (
    <View style={styles.container}>
      <AppText style={[styles.title, { color: colors.textPrimary }]}>Travel Mode</AppText>
      <AppText style={[styles.body, { color: colors.textSecondary }]}>
        Activating Travel Mode tells the app you're on a trip. It becomes a capture companion: it surfaces prompts relevant to your journey, automatically organizes everything you save into your active trip, and keeps your feed focused on what's happening now. You can activate it manually, or let it auto-activate based on your trip album dates.
      </AppText>
      <View style={styles.actions}>
        <TouchableOpacity style={[styles.tryBtn, { backgroundColor: colors.textPrimary }]} onPress={onTry} activeOpacity={0.85}>
          <AppText style={[styles.tryText, { color: colors.background }]}>Set up a trip</AppText>
        </TouchableOpacity>
        <TouchableOpacity onPress={onNext} style={styles.skipLink}>
          <AppText style={[styles.skipText, { color: colors.textSecondary }]}>Got it, next</AppText>
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
  skipLink: { alignSelf: 'center' },
  skipText: { fontFamily: FONTS.inter, fontSize: 14 },
});

export default TravelModeStop;
