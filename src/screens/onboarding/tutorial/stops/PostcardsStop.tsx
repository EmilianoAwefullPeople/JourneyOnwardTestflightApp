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

const PostcardsStop: React.FC<Props> = ({ onNext, onTry }) => {
  const { colors } = useTheme();
  return (
    <View style={styles.container}>
      <AppText style={[styles.title, { color: colors.textPrimary }]}>Turn memories into something you can share</AppText>
      <AppText style={[styles.body, { color: colors.textSecondary }]}>
        Postcard Creator takes your photos and turns them into designed postcard-style visuals. Share them with friends, print them, or keep them as part of your archive. Each postcard is a compressed moment — one image that carries the whole feeling of a place.
      </AppText>
      <View style={styles.actions}>
        <TouchableOpacity style={[styles.tryBtn, { backgroundColor: colors.textPrimary }]} onPress={onTry} activeOpacity={0.85}>
          <AppText style={[styles.tryText, { color: colors.background }]}>Create a postcard</AppText>
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

export default PostcardsStop;
