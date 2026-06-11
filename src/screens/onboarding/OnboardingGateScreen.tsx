// OnboardingGateScreen
// Phase 0: 4-step wizard collecting name, traveler tier, intent, and email.
// Each step is rendered inline; no separate route per step.

import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Keyboard,
  Animated,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import AppText from '../../components/common/AppText';
import { MeshGradientBackground } from '../../components/common/MeshGradientBackground';
import { useTheme } from '../../context/ThemeContext';
import { useAppContext } from '../../context/AppContext';
import { FONTS, FONT_WEIGHTS, SPACING } from '../../config/constants';
import {
  TRAVELER_TIER_OPTIONS,
  INTENT_OPTIONS,
  TravelerTier,
  OnboardingIntent,
  OnboardingProfileDraft,
} from '../../models/UserProfile';
import { RootStackParamList } from '../../navigation/types';
import { logger } from '../../utils/logger';

type Step = 1 | 2 | 3 | 4;

type NavProp = NativeStackNavigationProp<RootStackParamList, 'OnboardingGate'>;

const TOTAL_STEPS = 4;

const OnboardingGateScreen: React.FC = () => {
  const navigation = useNavigation<NavProp>();
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const { saveUserProfile, userProfile, onboardingResumePath, onboardingResumeStep } = useAppContext();

  const [step, setStep] = useState<Step>(1);
  const [name, setName] = useState(userProfile?.name ?? '');
  const [selectedTier, setSelectedTier] = useState<TravelerTier | null>(userProfile?.travelerTier ?? null);
  const [tierCelebrating, setTierCelebrating] = useState(false);
  const [selectedIntents, setSelectedIntents] = useState<OnboardingIntent[]>(userProfile?.intent ?? []);
  const [email, setEmail] = useState(userProfile?.email ?? '');

  const celebrateAnim = useRef(new Animated.Value(1)).current;
  const nameInputRef = useRef<TextInput>(null);
  const emailInputRef = useRef<TextInput>(null);
  const resumeChecked = useRef(false);

  // On mount: if user previously started the tutorial, jump back there
  useEffect(() => {
    if (resumeChecked.current) return;
    resumeChecked.current = true;
    if (onboardingResumePath === 'tutorial' && userProfile) {
      const draft: OnboardingProfileDraft = {
        name: userProfile.name,
        travelerTier: userProfile.travelerTier,
        intent: userProfile.intent,
        email: userProfile.email,
      };
      navigation.replace('OnboardingTutorial', { draft, resumeStep: onboardingResumeStep });
    }
  // Only run once on mount — intentionally excluding deps that shouldn't trigger re-run
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (step === 1) {
      setTimeout(() => nameInputRef.current?.focus(), 300);
    }
  }, [step]);

  const runTierCelebration = (tier: TravelerTier) => {
    setSelectedTier(tier);
    setTierCelebrating(true);
    Animated.sequence([
      Animated.timing(celebrateAnim, { toValue: 1.12, duration: 160, useNativeDriver: true }),
      Animated.spring(celebrateAnim, { toValue: 1, useNativeDriver: true, tension: 200, friction: 10 }),
    ]).start(() => setTierCelebrating(false));
  };

  const toggleIntent = (intent: OnboardingIntent) => {
    setSelectedIntents((prev) =>
      prev.includes(intent) ? prev.filter((i) => i !== intent) : [...prev, intent]
    );
  };

  const validateEmail = (e: string) => {
    if (!e.trim()) return true; // optional
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim());
  };

  const canProceed = () => {
    if (step === 1) return name.trim().length > 0;
    if (step === 2) return selectedTier !== null;
    if (step === 3) return selectedIntents.length > 0;
    return true; // step 4 email is optional
  };

  const handleNext = useCallback(async () => {
    Keyboard.dismiss();
    if (!canProceed()) return;

    if (step === 4) {
      if (email.trim() && !validateEmail(email)) {
        Alert.alert('Invalid email', 'Please enter a valid email address or leave it blank.');
        return;
      }
      // Save profile draft to DB before navigating
      try {
        await saveUserProfile({
          name: name.trim(),
          travelerTier: selectedTier ?? undefined,
          intent: selectedIntents,
          email: email.trim() || undefined,
        });
      } catch (e) {
        logger.error('OnboardingGate: failed to save profile', e);
      }
      const draft: OnboardingProfileDraft = {
        name: name.trim(),
        travelerTier: selectedTier ?? undefined,
        intent: selectedIntents,
        email: email.trim() || undefined,
      };
      navigation.navigate('OnboardingPathSelect', { draft });
      return;
    }

    setStep((s) => (s + 1) as Step);
  }, [step, name, selectedTier, selectedIntents, email, navigation, saveUserProfile]);

  const handleBack = useCallback(() => {
    Keyboard.dismiss();
    if (step === 1) return; // no back on first step
    setStep((s) => (s - 1) as Step);
  }, [step]);

  const handleSkipEmail = useCallback(async () => {
    try {
      await saveUserProfile({
        name: name.trim(),
        travelerTier: selectedTier ?? undefined,
        intent: selectedIntents,
      });
    } catch (e) {
      logger.error('OnboardingGate: failed to save profile on skip', e);
    }
    const draft: OnboardingProfileDraft = {
      name: name.trim(),
      travelerTier: selectedTier ?? undefined,
      intent: selectedIntents,
    };
    navigation.navigate('OnboardingPathSelect', { draft });
  }, [name, selectedTier, selectedIntents, navigation, saveUserProfile]);

  const tierLabel = selectedTier
    ? TRAVELER_TIER_OPTIONS.find((o) => o.tier === selectedTier)?.label
    : null;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <MeshGradientBackground baseColor={colors.background} lightMode={!isDark} />

        {/* Header */}
        <View style={[styles.header, { paddingTop: insets.top + SPACING.sm }]}>
          {step > 1 && (
            <TouchableOpacity
              style={[styles.backBtn, { backgroundColor: colors.surfaceVariant, borderColor: colors.border }]}
              onPress={handleBack}
              accessibilityRole="button"
              accessibilityLabel="Back"
            >
              <Ionicons name="chevron-back" size={20} color={colors.textPrimary} />
            </TouchableOpacity>
          )}
          <View style={styles.progressRow}>
            {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
              <View
                key={i}
                style={[
                  styles.progressDot,
                  {
                    backgroundColor: i < step ? colors.textPrimary : colors.border,
                    width: i + 1 === step ? 20 : 8,
                  },
                ]}
              />
            ))}
          </View>
          <AppText style={[styles.progressLabel, { color: colors.textSecondary }]}>
            {step} of {TOTAL_STEPS}
          </AppText>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 120 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Step 1: Name */}
          {step === 1 && (
            <View style={styles.stepContainer}>
              <AppText style={[styles.question, { color: colors.textPrimary }]}>
                What should we call you?
              </AppText>
              <TextInput
                ref={nameInputRef}
                style={[styles.textInput, { backgroundColor: colors.surface, color: colors.textPrimary, borderColor: colors.border }]}
                placeholder="Your name"
                placeholderTextColor={colors.textSecondary}
                value={name}
                onChangeText={setName}
                returnKeyType="next"
                onSubmitEditing={handleNext}
                autoCapitalize="words"
                autoCorrect={false}
                maxLength={60}
              />
            </View>
          )}

          {/* Step 2: Traveler Tier */}
          {step === 2 && (
            <View style={styles.stepContainer}>
              <AppText style={[styles.question, { color: colors.textPrimary }]}>
                How many countries have you traveled to?
              </AppText>
              <View style={styles.tierOptions}>
                {TRAVELER_TIER_OPTIONS.map((opt) => {
                  const isSelected = selectedTier === opt.tier;
                  return (
                    <TouchableOpacity
                      key={opt.tier}
                      style={[
                        styles.tierCard,
                        {
                          backgroundColor: isSelected ? colors.surfaceVariant : colors.surface,
                          borderColor: isSelected ? colors.textPrimary : colors.border,
                        },
                      ]}
                      onPress={() => runTierCelebration(opt.tier)}
                      activeOpacity={0.8}
                      accessibilityRole="button"
                      accessibilityState={{ selected: isSelected }}
                    >
                      <AppText style={[styles.tierRange, { color: isSelected ? colors.textPrimary : colors.textSecondary }]}>
                        {opt.range}
                      </AppText>
                      <AppText style={[styles.tierLabel, { color: colors.textPrimary }]}>
                        {opt.label}
                      </AppText>
                    </TouchableOpacity>
                  );
                })}
              </View>
              {tierLabel && (
                <Animated.View style={{ transform: [{ scale: celebrateAnim }] }}>
                  <AppText style={[styles.tierCelebration, { color: colors.textPrimary }]}>
                    You're a {tierLabel}!
                  </AppText>
                </Animated.View>
              )}
            </View>
          )}

          {/* Step 3: Intent */}
          {step === 3 && (
            <View style={styles.stepContainer}>
              <AppText style={[styles.question, { color: colors.textPrimary }]}>
                What are you here for?
              </AppText>
              <AppText style={[styles.subtext, { color: colors.textSecondary }]}>
                Pick all that apply
              </AppText>
              <View style={styles.intentOptions}>
                {INTENT_OPTIONS.map((opt) => {
                  const isSelected = selectedIntents.includes(opt.intent);
                  return (
                    <TouchableOpacity
                      key={opt.intent}
                      style={[
                        styles.intentCard,
                        {
                          backgroundColor: isSelected ? colors.surfaceVariant : colors.surface,
                          borderColor: isSelected ? colors.textPrimary : colors.border,
                        },
                      ]}
                      onPress={() => toggleIntent(opt.intent)}
                      activeOpacity={0.8}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: isSelected }}
                    >
                      <AppText style={styles.intentEmoji}>{opt.emoji}</AppText>
                      <AppText style={[styles.intentLabel, { color: colors.textPrimary }]}>
                        {opt.label}
                      </AppText>
                      {isSelected && (
                        <Ionicons name="checkmark-circle" size={18} color={colors.textPrimary} style={styles.intentCheck} />
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          )}

          {/* Step 4: Email */}
          {step === 4 && (
            <View style={styles.stepContainer}>
              <AppText style={[styles.question, { color: colors.textPrimary }]}>
                Save your account
              </AppText>
              <AppText style={[styles.subtext, { color: colors.textSecondary }]}>
                We'll use this to back up your memories and keep your account safe.
              </AppText>
              <TextInput
                ref={emailInputRef}
                style={[styles.textInput, { backgroundColor: colors.surface, color: colors.textPrimary, borderColor: colors.border }]}
                placeholder="your@email.com"
                placeholderTextColor={colors.textSecondary}
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="done"
                onSubmitEditing={handleNext}
              />
              <TouchableOpacity onPress={handleSkipEmail} style={styles.skipLink}>
                <AppText style={[styles.skipText, { color: colors.textSecondary }]}>
                  Skip for now
                </AppText>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>

        {/* CTA Button */}
        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, SPACING.md) + SPACING.md }]}>
          <TouchableOpacity
            style={[styles.cta, { backgroundColor: colors.textPrimary, opacity: canProceed() ? 1 : 0.4 }]}
            onPress={handleNext}
            disabled={!canProceed()}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={step < 4 ? 'Continue' : 'Save and continue'}
          >
            <AppText style={[styles.ctaText, { color: colors.background }]}>
              {step < 4 ? 'Continue' : 'Save and continue'}
            </AppText>
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
    paddingBottom: SPACING.md,
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
  progressRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  progressDot: {
    height: 8,
    borderRadius: 4,
  },
  progressLabel: {
    fontFamily: FONTS.inter,
    fontSize: 13,
    fontWeight: FONT_WEIGHTS.semibold,
  },
  scroll: { flex: 1 },
  content: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.xl,
  },
  stepContainer: { gap: SPACING.lg },
  question: {
    fontFamily: FONTS.inter,
    fontSize: 26,
    fontWeight: FONT_WEIGHTS.bold,
    lineHeight: 34,
  },
  subtext: {
    fontFamily: FONTS.inter,
    fontSize: 15,
    marginTop: -SPACING.sm,
  },
  textInput: {
    height: 52,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: SPACING.md,
    fontFamily: FONTS.inter,
    fontSize: 16,
  },
  tierOptions: { gap: SPACING.sm },
  tierCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: SPACING.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  tierRange: {
    fontFamily: FONTS.inter,
    fontSize: 13,
    flex: 1,
  },
  tierLabel: {
    fontFamily: FONTS.inter,
    fontSize: 15,
    fontWeight: FONT_WEIGHTS.semibold,
  },
  tierCelebration: {
    fontFamily: FONTS.inter,
    fontSize: 18,
    fontWeight: FONT_WEIGHTS.bold,
    textAlign: 'center',
    marginTop: SPACING.sm,
  },
  intentOptions: { gap: SPACING.sm },
  intentCard: {
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 14,
    paddingHorizontal: SPACING.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  intentEmoji: { fontSize: 20 },
  intentLabel: {
    fontFamily: FONTS.inter,
    fontSize: 15,
    fontWeight: FONT_WEIGHTS.semibold,
    flex: 1,
  },
  intentCheck: { marginLeft: 'auto' },
  skipLink: { alignSelf: 'center', marginTop: SPACING.sm },
  skipText: { fontFamily: FONTS.inter, fontSize: 14 },
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
  ctaText: {
    color: '#fff',
    fontFamily: FONTS.inter,
    fontSize: 16,
    fontWeight: FONT_WEIGHTS.semibold,
  },
});

export default OnboardingGateScreen;
