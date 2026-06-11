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

const JournalEntryBarStop: React.FC<Props> = ({ onNext, onTry }) => {
  const { colors } = useTheme();
  return (
    <View style={styles.container}>
      <AppText style={[styles.title, { color: colors.textPrimary }]}>Your journal, always one tap away</AppText>
      <AppText style={[styles.body, { color: colors.textSecondary }]}>
        The journal entry bar at the bottom of your Home feed isn't just a text box — it's a timestamped, location-tagged memory entry. This is how you capture the feeling, not just the photo. Every moment you write becomes part of your timeline, linked to where you were and when.
      </AppText>
      <View style={styles.actions}>
        <TouchableOpacity style={[styles.tryBtn, { backgroundColor: colors.textPrimary }]} onPress={onTry} activeOpacity={0.85}>
          <AppText style={[styles.tryText, { color: colors.background }]}>Try it now</AppText>
        </TouchableOpacity>
        <TouchableOpacity onPress={onNext} style={styles.skipLink}>
          <AppText style={[styles.skipText, { color: colors.textSecondary }]}>Skip</AppText>
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

export default JournalEntryBarStop;
