// UnpackProcessingScreen — clusters picked photos into suggested experiences.
// Runs in the background while showing ambient copy. Gesture disabled: no back nav.

import React, { useEffect, useRef, useState } from 'react';
import { View, StyleSheet, Animated, ActivityIndicator } from 'react-native';
import { useNavigation, useRoute, RouteProp, CommonActions } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AppText from '../../components/common/AppText';
import { MeshGradientBackground } from '../../components/common/MeshGradientBackground';
import { useTheme } from '../../context/ThemeContext';
import { FONTS, FONT_WEIGHTS, SPACING } from '../../config/constants';
import * as MediaLibrary from 'expo-media-library';
import { RootStackParamList } from '../../navigation/types';
import { runImportFromSelectedAssets, type PickedGalleryAsset } from '../../services/ImportLatestService';
import { logger } from '../../utils/logger';
import { mapWithConcurrency } from '../../utils/concurrency';

type NavProp = NativeStackNavigationProp<RootStackParamList>;
type RoutePropT = RouteProp<RootStackParamList, 'UnpackProcessing'>;

function inferDateRange(suggestions: { timestamp: string }[]): { start: string; end: string } {
  const times = suggestions
    .map((s) => new Date(s.timestamp).getTime())
    .filter((t) => Number.isFinite(t));
  if (times.length === 0) {
    const now = new Date().toISOString();
    return { start: now, end: now };
  }
  return {
    start: new Date(Math.min(...times)).toISOString(),
    end: new Date(Math.max(...times)).toISOString(),
  };
}

const COPY_STEPS = [
  'Finding the moments in your photos…',
  'Grouping by time and place…',
  'Getting your memories ready…',
];

const UnpackProcessingScreen: React.FC = () => {
  const navigation = useNavigation<NavProp>();
  const route = useRoute<RoutePropT>();
  const {
    albumId,
    pickedAssets,
    albumName,
    albumStartDate,
    albumEndDate,
    albumDescription,
  } = route.params;
  const isPhotosFirst = !albumId;
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();

  const [copyIndex, setCopyIndex] = useState(0);
  const fadeAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    let step = 0;
    const advance = () => {
      Animated.timing(fadeAnim, { toValue: 0, duration: 350, useNativeDriver: true }).start(() => {
        step = Math.min(step + 1, COPY_STEPS.length - 1);
        setCopyIndex(step);
        Animated.timing(fadeAnim, { toValue: 1, duration: 350, useNativeDriver: true }).start();
      });
    };
    const t1 = setTimeout(advance, 1600);
    const t2 = setTimeout(advance, 3200);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [fadeAnim]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      // Manual picks arrive without EXIF (expo-image-picker was called without
      // exif:true so it resolves immediately). Enrich here using MediaLibrary so
      // clustering has accurate creation dates and GPS for grouping.
      // Date-range assets already carry EXIF from handleDateRangeSearch — skip them.
      let assetsToProcess: PickedGalleryAsset[] = pickedAssets;
      const needsEnrichment = pickedAssets.some((a) => a.assetId && !a.exif);
      if (needsEnrichment) {
        try {
          assetsToProcess = await mapWithConcurrency(
            pickedAssets,
            8,
            async (asset): Promise<PickedGalleryAsset> => {
              if (!asset.assetId || asset.exif) return asset;
              try {
                const info = await MediaLibrary.getAssetInfoAsync(asset.assetId, {
                  shouldDownloadFromNetwork: false,
                });
                return { ...asset, exif: (info.exif as Record<string, unknown> | null) ?? null };
              } catch {
                return asset;
              }
            }
          );
        } catch (err) {
          logger.warn('UnpackProcessing: EXIF enrichment failed, proceeding without it', err);
          assetsToProcess = pickedAssets;
        }
        if (cancelled) return;
      }

      let suggestions: Awaited<ReturnType<typeof runImportFromSelectedAssets>>['suggestions'] = [];
      try {
        const result = await runImportFromSelectedAssets(assetsToProcess);
        if (cancelled) return;
        suggestions = result.suggestions;
      } catch (e) {
        logger.error('UnpackProcessing: clustering failed', e);
        if (cancelled) return;
      }

      setTimeout(() => {
        if (cancelled) return;
        if (isPhotosFirst) {
          // Path B: navigate to trip naming with inferred dates; back returns to photo picking.
          const { start, end } = inferDateRange(suggestions);
          navigation.dispatch(
            CommonActions.reset({
              index: 2,
              routes: [
                { name: 'MainTabs' },
                { name: 'UnpackAddMemories' },
                {
                  name: 'UnpackTripDetails',
                  params: { suggestions, inferredStartDate: start, inferredEndDate: end },
                },
              ],
            })
          );
        } else {
          // Path A: go straight to highlight, forwarding album metadata so Stage 3
          // can persist the album to the DB only after the user commits.
          navigation.dispatch(
            CommonActions.reset({
              index: 2,
              routes: [
                { name: 'MainTabs' },
                { name: 'UnpackTripDetails' },
                {
                  name: 'UnpackHighlight',
                  params: {
                    albumId: albumId!,
                    suggestions,
                    albumName,
                    albumStartDate,
                    albumEndDate,
                    albumDescription,
                  },
                },
              ],
            })
          );
        }
      }, 800);
    };
    const t = setTimeout(run, 300);
    return () => { cancelled = true; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <MeshGradientBackground baseColor={colors.background} lightMode={!isDark} />
      <View style={[styles.content, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <ActivityIndicator size="large" color={colors.textSecondary} />
        <Animated.View style={{ opacity: fadeAnim }}>
          <AppText style={[styles.copy, { color: colors.textPrimary }]}>
            {COPY_STEPS[copyIndex]}
          </AppText>
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
    gap: SPACING.xl,
  },
  copy: {
    fontFamily: FONTS.inter,
    fontSize: 18,
    lineHeight: 28,
    textAlign: 'center',
    fontWeight: FONT_WEIGHTS.regular as any,
  },
});

export default UnpackProcessingScreen;
