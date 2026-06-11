// OnboardingQSExperiencesScreen — QS Step 3 of 6
// User can add a short note or tag about the trip. Skippable.

import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Keyboard,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import AppText from '../../../components/common/AppText';
import { MeshGradientBackground } from '../../../components/common/MeshGradientBackground';
import { useTheme } from '../../../context/ThemeContext';
import { FONTS, FONT_WEIGHTS, SPACING } from '../../../config/constants';
import { RootStackParamList } from '../../../navigation/types';

type NavProp = NativeStackNavigationProp<RootStackParamList, 'OnboardingQSExperiences'>;
type RoutePropT = RouteProp<RootStackParamList, 'OnboardingQSExperiences'>;

// Common experience tags for quick selection
const QUICK_TAGS = [
  '🗺️ Adventure', '🏖️ Beach', '🏔️ Mountains', '🍜 Food',
  '🎭 Culture', '🏛️ History', '🌿 Nature', '🎶 Music',
  '🛍️ Shopping', '🚂 Road trip', '👥 With friends', '👨‍👩‍👧 Family',
];

const OnboardingQSExperiencesScreen: React.FC = () => {
  const navigation = useNavigation<NavProp>();
  const route = useRoute<RoutePropT>();
  const { draft, country, selectedSuggestions } = route.params;
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();

  const [note, setNote] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) => prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]);
  };

  const proceed = (skipNote = false) => {
    Keyboard.dismiss();
    const finalNote = skipNote ? undefined : (note.trim() || undefined);
    navigation.navigate('OnboardingQSGenerating', {
      draft,
      country,
      selectedSuggestions,
      note: finalNote ?? (selectedTags.length ? selectedTags.join(', ') : undefined),
    });
  };

  const selectedPhotoCount = selectedSuggestions.reduce(
    (count, suggestion) => count + suggestion.assets.length,
    0
  );

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
          <AppText style={[styles.stepLabel, { color: colors.textSecondary }]}>Step 3 of 6</AppText>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 120 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <AppText style={[styles.title, { color: colors.textPrimary }]}>
            What made this trip worth it?
          </AppText>
          <AppText style={[styles.subtitle, { color: colors.textSecondary }]}>
            {selectedPhotoCount} photo{selectedPhotoCount !== 1 ? 's' : ''} from {country}
          </AppText>

          {/* Quick tags */}
          <AppText style={[styles.sectionLabel, { color: colors.textSecondary }]}>Quick tags</AppText>
          <View style={styles.tagsWrap}>
            {QUICK_TAGS.map((tag) => {
              const sel = selectedTags.includes(tag);
              return (
                <TouchableOpacity
                  key={tag}
                  style={[
                    styles.tag,
                    {
                      backgroundColor: sel ? colors.surfaceVariant : colors.surface,
                      borderColor: sel ? colors.textPrimary : colors.border,
                    },
                  ]}
                  onPress={() => toggleTag(tag)}
                  activeOpacity={0.8}
                >
                  <AppText style={[styles.tagText, { color: colors.textPrimary }]}>
                    {tag}
                  </AppText>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Short note */}
          <AppText style={[styles.sectionLabel, { color: colors.textSecondary }]}>Or add a note</AppText>
          <TextInput
            style={[
              styles.noteInput,
              { backgroundColor: colors.surface, color: colors.textPrimary, borderColor: colors.border },
            ]}
            placeholder="One sentence about this trip…"
            placeholderTextColor={colors.textSecondary}
            value={note}
            onChangeText={setNote}
            multiline
            maxLength={200}
          />
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, SPACING.md) + SPACING.md }]}>
          <TouchableOpacity
            style={[styles.cta, { backgroundColor: colors.textPrimary }]}
            onPress={() => proceed(false)}
            activeOpacity={0.85}
            accessibilityRole="button"
          >
            <AppText style={[styles.ctaText, { color: colors.background }]}>Build my album →</AppText>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => proceed(true)} style={styles.skipLink}>
            <AppText style={[styles.skipText, { color: colors.textSecondary }]}>Skip this step</AppText>
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
  content: { paddingHorizontal: SPACING.lg, paddingTop: SPACING.lg, gap: SPACING.md },
  title: { fontFamily: FONTS.inter, fontSize: 26, fontWeight: FONT_WEIGHTS.bold, lineHeight: 34 },
  subtitle: { fontFamily: FONTS.inter, fontSize: 15, marginTop: -SPACING.sm },
  sectionLabel: { fontFamily: FONTS.inter, fontSize: 12, fontWeight: FONT_WEIGHTS.semibold, textTransform: 'uppercase', letterSpacing: 0.5 },
  tagsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  tag: {
    borderRadius: 20,
    borderWidth: 1,
    paddingVertical: 7,
    paddingHorizontal: SPACING.sm,
  },
  tagText: { fontFamily: FONTS.inter, fontSize: 13 },
  noteInput: {
    borderRadius: 12,
    borderWidth: 1,
    padding: SPACING.md,
    fontFamily: FONTS.inter,
    fontSize: 15,
    minHeight: 80,
    textAlignVertical: 'top',
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

export default OnboardingQSExperiencesScreen;
