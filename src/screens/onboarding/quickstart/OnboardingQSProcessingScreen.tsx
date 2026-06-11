// OnboardingQSProcessingScreen — QS transition step
// Converts picked photos into clustered trip suggestions, then continues to experiences.

import React, { useEffect, useRef, useState } from 'react';
import { View, StyleSheet, Animated } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import AppText from '../../../components/common/AppText';
import { MeshGradientBackground } from '../../../components/common/MeshGradientBackground';
import { useTheme } from '../../../context/ThemeContext';
import { FONTS, FONT_WEIGHTS, SPACING } from '../../../config/constants';
import { RootStackParamList } from '../../../navigation/types';
import { logger } from '../../../utils/logger';
import { runImportFromSelectedAssets } from '../../../services/ImportLatestService';

type NavProp = NativeStackNavigationProp<RootStackParamList, 'OnboardingQSProcessing'>;
type RoutePropT = RouteProp<RootStackParamList, 'OnboardingQSProcessing'>;

const COPY_STEPS = ['Scanning your photos…', 'Grouping moments…', 'Building your trip highlights…'];

const OnboardingQSProcessingScreen: React.FC = () => {
  const navigation = useNavigation<NavProp>();
  const route = useRoute<RoutePropT>();
  const { draft, country, pickedAssets } = route.params;
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();

  const [copyIndex, setCopyIndex] = useState(0);
  const fadeAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    let step = 0;
    const advance = () => {
      Animated.timing(fadeAnim, { toValue: 0, duration: 300, useNativeDriver: true }).start(() => {
        step = Math.min(step + 1, COPY_STEPS.length - 1);
        setCopyIndex(step);
        Animated.timing(fadeAnim, { toValue: 1, duration: 300, useNativeDriver: true }).start();
      });
    };
    const timer1 = setTimeout(advance, 900);
    const timer2 = setTimeout(advance, 2100);
    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
    };
  }, [fadeAnim]);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      const result = await runImportFromSelectedAssets(pickedAssets);
      if (cancelled) return;

      const suggestions = result.suggestions;
      if (suggestions.length === 0) {
        logger.warn('QSProcessing: no suggestions generated; continuing with fallback single suggestion');
      }

      const selectedSuggestions =
        suggestions.length > 0
          ? suggestions
          : [
              {
                id: 'fallback-selected-assets',
                timestamp: new Date().toISOString(),
                assets: pickedAssets.map((asset, index) => ({
                  id: asset.assetId ?? `${asset.uri}-${index}`,
                  uri: asset.uri,
                  displayUri: asset.uri,
                  creationTime: Date.now(),
                  width: asset.width,
                  height: asset.height,
                  exif: asset.exif ?? null,
                })),
              },
            ];

      navigation.replace('OnboardingQSExperiences', {
        draft,
        country,
        selectedSuggestions,
      });
    };

    const t = setTimeout(run, 200);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [country, draft, navigation, pickedAssets]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <MeshGradientBackground baseColor={colors.background} lightMode={!isDark} />
      <View style={[styles.content, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <View style={styles.spinnerRow}>
          {[0, 1, 2].map((i) => (
            <View
              key={i}
              style={[
                styles.dot,
                { backgroundColor: colors.textPrimary, opacity: 0.3 + 0.35 * ((copyIndex + i) % 3) },
              ]}
            />
          ))}
        </View>
        <Animated.View style={{ opacity: fadeAnim }}>
          <AppText style={[styles.copy, { color: colors.textPrimary }]}>{COPY_STEPS[copyIndex]}</AppText>
        </Animated.View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING.xl,
    gap: SPACING.lg,
  },
  spinnerRow: { flexDirection: 'row', gap: 10 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  copy: {
    fontFamily: FONTS.inter,
    fontSize: 18,
    lineHeight: 28,
    textAlign: 'center',
    fontWeight: FONT_WEIGHTS.semibold,
  },
});

export default OnboardingQSProcessingScreen;
