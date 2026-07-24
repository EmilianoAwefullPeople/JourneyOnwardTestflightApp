// UnpackAddMemoriesScreen — Stage 2 of 4
// Lets the user pick photos by date range or manual gallery selection.
//
// Navigation architecture note:
// We never call navigation.navigate() from inside an async callback.
// On iOS, calling a native-stack push while a UIViewController (e.g. the
// PHPickerViewController) is still mid-dismiss is silently dropped by UIKit.
// Instead we store the confirmed assets in state (pendingAssets) and let a
// useEffect fire the navigate AFTER React has committed the render —
// which is always outside any native transition window.
//
// A full-screen overlay is shown in the same render as setPendingAssets(),
// so the user sees the loading state immediately — before UnpackProcessing
// even mounts — giving the appearance of an instant transition.

import React, { useEffect, useState } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as MediaLibrary from 'expo-media-library';
import AppText from '../../components/common/AppText';
import { MeshGradientBackground } from '../../components/common/MeshGradientBackground';
import { UnpackStepBar } from '../../components/unpack/UnpackStepBar';
import { useTheme } from '../../context/ThemeContext';
import { FONTS, FONT_WEIGHTS, SPACING } from '../../config/constants';
import { RootStackParamList } from '../../navigation/types';
import { logger } from '../../utils/logger';
import { parseExifDateTimeToMs } from '../../utils/exifTimestamp';
import type { PickedGalleryAsset } from '../../services/ImportLatestService';

type NavProp = NativeStackNavigationProp<RootStackParamList>;
type RoutePropT = RouteProp<RootStackParamList, 'UnpackAddMemories'>;

type ImportMode = 'date_range' | 'manual' | null;
const MAX_PHOTOS = 500;

const UnpackAddMemoriesScreen: React.FC = () => {
  const navigation = useNavigation<NavProp>();
  const route = useRoute<RoutePropT>();
  const { albumId, tripStartDate, tripEndDate, albumName, albumDescription } = route.params ?? {};
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();

  const isPhotosFirst = !albumId;

  const [mode, setMode] = useState<ImportMode>(null);
  const [startDate, setStartDate] = useState(() => {
    if (tripStartDate) return new Date(tripStartDate);
    const d = new Date();
    d.setDate(d.getDate() - 14);
    return d;
  });
  const [endDate, setEndDate] = useState(() =>
    tripEndDate ? new Date(tripEndDate) : new Date()
  );
  const [activePicker, setActivePicker] = useState<'start' | 'end' | null>(null);
  const [loading, setLoading] = useState(false);

  // pickerLoading: true while launchImageLibraryAsync is pending (i.e. picker has
  // dismissed but the JS promise hasn't resolved yet).  Shows the overlay immediately
  // so there is zero blank-screen gap after the picker closes.
  const [pickerLoading, setPickerLoading] = useState(false);

  // When non-null the user has confirmed their selection.
  // The useEffect below fires navigate() after React commits this render.
  const [pendingAssets, setPendingAssets] = useState<PickedGalleryAsset[] | null>(null);

  useEffect(() => {
    if (!pendingAssets || pendingAssets.length === 0) return;
    navigation.navigate('UnpackProcessing', {
      albumId,
      pickedAssets: pendingAssets,
      albumName,
      albumStartDate: tripStartDate,
      albumEndDate: tripEndDate,
      albumDescription,
    });
    // Route params are stable for the lifetime of this screen mount;
    // navigation ref is stable from useNavigation. Safe to omit from deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingAssets]);

  // ─── Date range path ────────────────────────────────────────────────────────

  const handleDateRangeSearch = async () => {
    setLoading(true);
    try {
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Please allow access to your photo library to find photos.');
        return;
      }

      // MediaLibrary.getAssetsAsync filters by "Date Added", not EXIF "Date Taken".
      // Widen the query window ±1 day so late-sync and timezone-shifted photos
      // are included; the EXIF re-filter below narrows back to the exact range.
      const ONE_DAY_MS = 86_400_000;
      const wideAfter = startDate.getTime() - ONE_DAY_MS;
      const wideBefore = endDate.getTime() + 2 * ONE_DAY_MS;

      const allAssets: MediaLibrary.Asset[] = [];
      let cursor: string | undefined;
      do {
        const page = await MediaLibrary.getAssetsAsync({
          mediaType: MediaLibrary.MediaType.photo,
          createdAfter: wideAfter,
          createdBefore: wideBefore,
          first: 200,
          after: cursor,
          sortBy: [[MediaLibrary.SortBy.creationTime, false]],
        });
        allAssets.push(...page.assets);
        cursor = page.hasNextPage ? page.endCursor : undefined;
      } while (cursor != null && allAssets.length < MAX_PHOTOS);

      // Enrich with EXIF for accurate date filtering and GPS clustering.
      // shouldDownloadFromNetwork:false skips iCloud-only photos to avoid hangs.
      const enriched = await Promise.all(
        allAssets.slice(0, MAX_PHOTOS).map(async (asset) => {
          let exif: Record<string, unknown> | null = null;
          try {
            const info = await MediaLibrary.getAssetInfoAsync(asset.id, {
              shouldDownloadFromNetwork: false,
            });
            exif = (info.exif as Record<string, unknown> | null) ?? null;
          } catch (err) {
            logger.warn('UnpackAddMemories: failed to read EXIF', { id: asset.id, err });
          }
          return {
            uri: asset.uri,
            width: asset.width,
            height: asset.height,
            assetId: asset.id,
            exif,
          } as PickedGalleryAsset;
        })
      );

      // Re-filter by EXIF "Date Taken". Photos synced from iCloud or transferred
      // from another device can have a "Date Added" far outside the trip window.
      const rangeStartMs = new Date(startDate).setHours(0, 0, 0, 0);
      const rangeEndMs = new Date(endDate).setHours(23, 59, 59, 999);
      const filtered = enriched.filter((asset) => {
        const exifMs = parseExifDateTimeToMs(asset.exif);
        if (exifMs != null) return exifMs >= rangeStartMs && exifMs <= rangeEndMs;
        return true; // no EXIF date — keep (already passed the widened MediaLibrary filter)
      });

      if (filtered.length === 0) {
        Alert.alert(
          'No photos found',
          `No photos found between ${startDate.toLocaleDateString()} and ${endDate.toLocaleDateString()}. Try adjusting the dates or use "Pick manually".`
        );
        return;
      }

      // Commit selection → overlay renders this frame → useEffect navigates next frame.
      setPendingAssets(filtered);
    } catch (e) {
      logger.error('UnpackAddMemories: date range fetch failed', e);
      Alert.alert('Error', 'Could not load photos. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // ─── Manual pick path ───────────────────────────────────────────────────────

  const handleManualPick = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Please allow access to your photo library to pick photos.');
      return;
    }

    // Show overlay NOW so it's already visible the moment the picker dismisses.
    // The picker UI covers it while open; it's revealed on close while the
    // promise finishes any residual work.
    setPickerLoading(true);

    let result: ImagePicker.ImagePickerResult;
    try {
      result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsMultipleSelection: true,
        selectionLimit: MAX_PHOTOS,
        quality: 1,
        // exif intentionally omitted: on iOS, expo-image-picker reads EXIF in a
        // background OS thread AFTER the picker UI dismisses but BEFORE the JS
        // promise resolves — blocking for ~60s on large selections. Without exif:true
        // the promise resolves immediately on picker close. EXIF is enriched inside
        // UnpackProcessingScreen using MediaLibrary.getAssetInfoAsync instead.
      });
    } catch (e) {
      setPickerLoading(false);
      logger.error('UnpackAddMemories: image picker threw', e);
      Alert.alert('Error', 'Could not open the photo library. Please try again.');
      return;
    }

    if (result.canceled || result.assets.length === 0) {
      setPickerLoading(false);
      return;
    }

    // Commit selection → overlay renders this frame → useEffect navigates next frame.
    // Leave pickerLoading=true; the pendingAssets overlay takes over and the component
    // navigates away before any state cleanup is needed.
    setPendingAssets(
      result.assets.map((a) => ({
        uri: a.uri,
        width: a.width,
        height: a.height,
        assetId: a.assetId ?? undefined,
        exif: null, // enriched in UnpackProcessingScreen
      }))
    );
  };

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <MeshGradientBackground baseColor={colors.background} lightMode={!isDark} />

      <View style={[styles.header, { paddingTop: insets.top + SPACING.sm }]}>
        <View style={styles.headerRow}>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => navigation.goBack()}
            accessibilityRole="button"
            accessibilityLabel="Back"
          >
            <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
          </TouchableOpacity>
        </View>
        <UnpackStepBar currentStage={isPhotosFirst ? 1 : 2} />
      </View>

      <View style={[styles.content, { paddingBottom: insets.bottom + SPACING.xl }]}>
        <AppText style={[styles.title, { color: colors.textPrimary }]}>Add your memories</AppText>
        <AppText style={[styles.subtitle, { color: colors.textSecondary }]}>
          Choose how to bring in your photos.
        </AppText>

        <View style={styles.cards}>
          {/* Date range option */}
          <TouchableOpacity
            style={[
              styles.optCard,
              {
                backgroundColor: colors.surface,
                borderColor: mode === 'date_range' ? colors.textPrimary : colors.border,
                borderWidth: mode === 'date_range' ? 2 : 1,
              },
            ]}
            onPress={() => setMode('date_range')}
            activeOpacity={0.85}
          >
            <Ionicons
              name="calendar-outline"
              size={24}
              color={mode === 'date_range' ? colors.textPrimary : colors.textSecondary}
            />
            <View style={{ flex: 1 }}>
              <AppText style={[styles.optTitle, { color: colors.textPrimary }]}>By date range</AppText>
              <AppText style={[styles.optBody, { color: colors.textSecondary }]}>
                Photos from your trip dates are pulled in automatically.
              </AppText>
            </View>
          </TouchableOpacity>

          {/* Manual pick option */}
          <TouchableOpacity
            style={[
              styles.optCard,
              {
                backgroundColor: colors.surface,
                borderColor: mode === 'manual' ? colors.textPrimary : colors.border,
                borderWidth: mode === 'manual' ? 2 : 1,
              },
            ]}
            onPress={async () => {
              setMode('manual');
              await handleManualPick();
            }}
            activeOpacity={0.85}
          >
            <Ionicons
              name="images-outline"
              size={24}
              color={mode === 'manual' ? colors.textPrimary : colors.textSecondary}
            />
            <View style={{ flex: 1 }}>
              <AppText style={[styles.optTitle, { color: colors.textPrimary }]}>Pick manually</AppText>
              <AppText style={[styles.optBody, { color: colors.textSecondary }]}>
                Choose specific photos from your gallery.
              </AppText>
            </View>
          </TouchableOpacity>
        </View>

        {/* Date range pickers — shown when date_range mode is active */}
        {mode === 'date_range' && (
          <View style={[styles.dateSection, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.dateRow}>
              <AppText style={[styles.dateLabel, { color: colors.textSecondary }]}>From</AppText>
              <TouchableOpacity
                style={[styles.datePill, { backgroundColor: colors.surfaceVariant, borderColor: colors.border }]}
                onPress={() => setActivePicker(activePicker === 'start' ? null : 'start')}
              >
                <AppText style={[styles.datePillText, { color: colors.textPrimary }]}>
                  {startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </AppText>
              </TouchableOpacity>
            </View>
            {activePicker === 'start' && (
              <DateTimePicker
                value={startDate}
                mode="date"
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                maximumDate={endDate}
                onChange={(_, d) => { if (d) { setStartDate(d); setActivePicker(null); } }}
              />
            )}
            <View style={styles.dateRow}>
              <AppText style={[styles.dateLabel, { color: colors.textSecondary }]}>To</AppText>
              <TouchableOpacity
                style={[styles.datePill, { backgroundColor: colors.surfaceVariant, borderColor: colors.border }]}
                onPress={() => setActivePicker(activePicker === 'end' ? null : 'end')}
              >
                <AppText style={[styles.datePillText, { color: colors.textPrimary }]}>
                  {endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </AppText>
              </TouchableOpacity>
            </View>
            {activePicker === 'end' && (
              <DateTimePicker
                value={endDate}
                mode="date"
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                minimumDate={startDate}
                maximumDate={new Date()}
                onChange={(_, d) => { if (d) { setEndDate(d); setActivePicker(null); } }}
              />
            )}
            <TouchableOpacity
              style={[styles.findBtn, { backgroundColor: colors.buttonGray, opacity: loading ? 0.6 : 1 }]}
              onPress={handleDateRangeSearch}
              disabled={loading}
              activeOpacity={0.8}
            >
              {loading ? (
                <ActivityIndicator color={colors.textPrimary} size="small" />
              ) : (
                <AppText style={[styles.findBtnText, { color: colors.textPrimary }]}>Find photos</AppText>
              )}
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/*
        Loading overlay — covers the screen from the moment the gallery picker
        closes (pickerLoading) through the navigate() call (pendingAssets).
        animation:'none' on UnpackProcessing makes the handoff seamless.
      */}
      {(pickerLoading || pendingAssets) && (
        <View style={[StyleSheet.absoluteFill, styles.pendingOverlay, { backgroundColor: colors.background }]}
          pointerEvents="box-only"
        >
          <MeshGradientBackground baseColor={colors.background} lightMode={!isDark} />
          <ActivityIndicator size="large" color={colors.textSecondary} />
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.md,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  backBtn: {
    padding: SPACING.xs,
    marginLeft: -SPACING.xs,
  },
  content: {
    flex: 1,
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
  },
  title: {
    fontFamily: FONTS.playfairDisplay,
    fontSize: 26,
    fontStyle: 'italic',
    fontWeight: FONT_WEIGHTS.bold as any,
    marginBottom: SPACING.xs,
  },
  subtitle: {
    fontFamily: FONTS.inter,
    fontSize: 15,
    marginBottom: SPACING.xl,
  },
  cards: { gap: SPACING.sm, marginBottom: SPACING.lg },
  optCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.md,
    borderRadius: 14,
    padding: SPACING.md,
  },
  optTitle: {
    fontFamily: FONTS.inter,
    fontSize: 15,
    fontWeight: FONT_WEIGHTS.semibold as any,
    marginBottom: 2,
  },
  optBody: {
    fontFamily: FONTS.inter,
    fontSize: 13,
    lineHeight: 18,
  },
  dateSection: {
    borderRadius: 14,
    borderWidth: 1,
    padding: SPACING.md,
    gap: SPACING.sm,
    marginBottom: SPACING.md,
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dateLabel: {
    fontFamily: FONTS.inter,
    fontSize: 14,
    fontWeight: FONT_WEIGHTS.semibold as any,
  },
  datePill: {
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
  },
  datePillText: {
    fontFamily: FONTS.inter,
    fontSize: 14,
  },
  findBtn: {
    borderRadius: 10,
    paddingVertical: SPACING.sm,
    alignItems: 'center' as const,
    marginTop: SPACING.xs,
  },
  findBtnText: {
    fontFamily: FONTS.inter,
    fontSize: 14,
    fontWeight: FONT_WEIGHTS.semibold as any,
  },
  pendingOverlay: {
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
  },
});

export default UnpackAddMemoriesScreen;
