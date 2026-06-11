// OnboardingTutorialExitScreen
// Final screen of the tutorial path: founders' note + summary.

import React, { useCallback, useState } from 'react';
import { View, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, CommonActions } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import AppText from '../../../components/common/AppText';
import { MeshGradientBackground } from '../../../components/common/MeshGradientBackground';
import { useTheme } from '../../../context/ThemeContext';
import { useAppContext } from '../../../context/AppContext';
import { FONTS, FONT_WEIGHTS, SPACING } from '../../../config/constants';
import { RootStackParamList } from '../../../navigation/types';
import { logger } from '../../../utils/logger';

type NavProp = NativeStackNavigationProp<RootStackParamList, 'OnboardingTutorialExit'>;

const FOUNDERS_NOTE =
  "We built Journey Onward because we kept losing the feeling of our trips — the moments that mattered. We're glad you're here. — Emiliano & Glenn";

const OnboardingTutorialExitScreen: React.FC = () => {
  const navigation = useNavigation<NavProp>();
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const { completeOnboarding } = useAppContext();
  const [entering, setEntering] = useState(false);

  const handleEnter = useCallback(async () => {
    setEntering(true);
    try {
      await completeOnboarding('tutorial');
    } catch (e) {
      logger.error('TutorialExit: completeOnboarding failed', e);
    } finally {
      setEntering(false);
    }
    navigation.dispatch(CommonActions.reset({ index: 0, routes: [{ name: 'MainTabs' }] }));
  }, [completeOnboarding, navigation]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <MeshGradientBackground baseColor={colors.background} lightMode={!isDark} />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + SPACING.xxl, paddingBottom: insets.bottom + 120 }]}
        showsVerticalScrollIndicator={false}
      >
        <AppText style={[styles.title, { color: colors.textPrimary }]}>
          You're ready to travel.
        </AppText>
        <AppText style={[styles.summary, { color: colors.textSecondary }]}>
          You now know how to capture, create, and relive your travels.
        </AppText>

        <View style={[styles.foundersCard, { backgroundColor: colors.surfaceVariant, borderColor: colors.border }]}>
          <AppText style={[styles.foundersText, { color: colors.textSecondary }]}>
            {FOUNDERS_NOTE}
          </AppText>
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, SPACING.md) + SPACING.md }]}>
        <TouchableOpacity
          style={[styles.cta, { backgroundColor: colors.textPrimary, opacity: entering ? 0.6 : 1 }]}
          onPress={handleEnter}
          disabled={entering}
          activeOpacity={0.85}
          accessibilityRole="button"
        >
          <AppText style={[styles.ctaText, { color: colors.background }]}>Start using Journey Onward</AppText>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { flex: 1 },
  content: { paddingHorizontal: SPACING.lg, gap: SPACING.xl },
  title: { fontFamily: FONTS.inter, fontSize: 32, fontWeight: FONT_WEIGHTS.bold, lineHeight: 42 },
  summary: { fontFamily: FONTS.inter, fontSize: 17, lineHeight: 26 },
  foundersCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: SPACING.xl,
    marginTop: SPACING.lg,
  },
  foundersText: {
    fontFamily: FONTS.inter,
    fontSize: 16,
    lineHeight: 24,
    fontStyle: 'italic',
  },
  footer: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.sm,
  },
  cta: {
    borderRadius: 14,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaText: { color: '#fff', fontFamily: FONTS.inter, fontSize: 16, fontWeight: FONT_WEIGHTS.semibold },
});

export default OnboardingTutorialExitScreen;
