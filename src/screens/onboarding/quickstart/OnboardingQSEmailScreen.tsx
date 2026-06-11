// OnboardingQSEmailScreen — QS Step 6 of 6
// Email input pre-filled from Phase 0 if provided. Founders' note below.

import React, { useState, useCallback } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp, CommonActions } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import AppText from '../../../components/common/AppText';
import { MeshGradientBackground } from '../../../components/common/MeshGradientBackground';
import { useTheme } from '../../../context/ThemeContext';
import { useAppContext } from '../../../context/AppContext';
import { FONTS, FONT_WEIGHTS, SPACING } from '../../../config/constants';
import { RootStackParamList } from '../../../navigation/types';
import { logger } from '../../../utils/logger';

type NavProp = NativeStackNavigationProp<RootStackParamList, 'OnboardingQSEmail'>;
type RoutePropT = RouteProp<RootStackParamList, 'OnboardingQSEmail'>;

const FOUNDERS_NOTE =
  "We built Journey Onward because we kept losing the feeling of our trips — the moments that mattered. We're glad you're here. — Emiliano & Glenn";

const OnboardingQSEmailScreen: React.FC = () => {
  const navigation = useNavigation<NavProp>();
  const route = useRoute<RoutePropT>();
  const { draft } = route.params;
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const { saveUserProfile, completeOnboarding } = useAppContext();

  const [email, setEmail] = useState(draft.email ?? '');
  const [saving, setSaving] = useState(false);

  const validateEmail = (e: string) =>
    !e.trim() || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim());

  const finish = useCallback(async (withEmail: boolean) => {
    if (withEmail && !validateEmail(email)) {
      Alert.alert('Invalid email', 'Please enter a valid email address or tap "Maybe later".');
      return;
    }
    setSaving(true);
    try {
      if (withEmail && email.trim()) {
        await saveUserProfile({ email: email.trim() });
      }
      await completeOnboarding('quick_start');
    } catch (e) {
      logger.error('QSEmail: finish failed', e);
    } finally {
      setSaving(false);
    }
    navigation.dispatch(CommonActions.reset({ index: 0, routes: [{ name: 'MainTabs' }] }));
  }, [email, saveUserProfile, completeOnboarding, navigation]);

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <MeshGradientBackground baseColor={colors.background} lightMode={!isDark} />

        <View style={[styles.header, { paddingTop: insets.top + SPACING.sm }]}>
          <TouchableOpacity
            style={[styles.backBtn, { backgroundColor: colors.surfaceVariant, borderColor: colors.border }]}
            onPress={() => navigation.goBack()}
            accessibilityRole="button"
            accessibilityLabel="Back"
          >
            <Ionicons name="chevron-back" size={20} color={colors.textPrimary} />
          </TouchableOpacity>
          <AppText style={[styles.stepLabel, { color: colors.textSecondary }]}>Step 6 of 6</AppText>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 120 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <AppText style={[styles.title, { color: colors.textPrimary }]}>Save your account</AppText>
          <AppText style={[styles.subtitle, { color: colors.textSecondary }]}>
            We'll use this to back up your memories and keep your account safe.
          </AppText>

          <TextInput
            style={[styles.input, { backgroundColor: colors.surface, color: colors.textPrimary, borderColor: colors.border }]}
            placeholder="your@email.com"
            placeholderTextColor={colors.textSecondary}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="done"
            onSubmitEditing={() => finish(true)}
          />

          {/* Founders' note */}
          <View style={[styles.foundersCard, { backgroundColor: colors.surfaceVariant, borderColor: colors.border }]}>
            <AppText style={[styles.foundersText, { color: colors.textSecondary }]}>
              {FOUNDERS_NOTE}
            </AppText>
          </View>
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, SPACING.md) + SPACING.md }]}>
          <TouchableOpacity
            style={[styles.cta, { backgroundColor: colors.textPrimary, opacity: saving ? 0.6 : 1 }]}
            onPress={() => finish(true)}
            disabled={saving}
            activeOpacity={0.85}
          >
            <AppText style={[styles.ctaText, { color: colors.background }]}>Start using Journey Onward</AppText>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => finish(false)} disabled={saving} style={styles.skipLink}>
            <AppText style={[styles.skipText, { color: colors.textSecondary }]}>Maybe later</AppText>
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.sm,
    gap: SPACING.sm,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepLabel: { fontFamily: FONTS.inter, fontSize: 13, fontWeight: FONT_WEIGHTS.semibold },
  scroll: { flex: 1 },
  content: { paddingHorizontal: SPACING.lg, paddingTop: SPACING.lg, gap: SPACING.xl },
  title: { fontFamily: FONTS.inter, fontSize: 26, fontWeight: FONT_WEIGHTS.bold, lineHeight: 34 },
  subtitle: { fontFamily: FONTS.inter, fontSize: 15, marginTop: -SPACING.md },
  input: {
    height: 52,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: SPACING.md,
    fontFamily: FONTS.inter,
    fontSize: 16,
  },
  foundersCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: SPACING.lg,
  },
  foundersText: {
    fontFamily: FONTS.inter,
    fontSize: 15,
    lineHeight: 22,
    fontStyle: 'italic',
  },
  footer: { paddingHorizontal: SPACING.lg, paddingTop: SPACING.sm, gap: SPACING.sm },
  cta: {
    borderRadius: 14,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaText: { color: '#fff', fontFamily: FONTS.inter, fontSize: 16, fontWeight: FONT_WEIGHTS.semibold },
  skipLink: { alignSelf: 'center' },
  skipText: { fontFamily: FONTS.inter, fontSize: 14 },
});

export default OnboardingQSEmailScreen;
