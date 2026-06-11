// OnboardingQSImportScreen — QS Step 2 of 6
// Two import options: by date range (MediaLibrary) or pick manually (ImagePicker).
// At least 1 photo required before proceeding.

import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as MediaLibrary from 'expo-media-library';
import AppText from '../../../components/common/AppText';
import { MeshGradientBackground } from '../../../components/common/MeshGradientBackground';
import { useTheme } from '../../../context/ThemeContext';
import { FONTS, FONT_WEIGHTS, SPACING } from '../../../config/constants';
import { RootStackParamList } from '../../../navigation/types';
import { logger } from '../../../utils/logger';
import type { PickedGalleryAsset } from '../../../services/ImportLatestService';

type NavProp = NativeStackNavigationProp<RootStackParamList, 'OnboardingQSImport'>;
type RoutePropT = RouteProp<RootStackParamList, 'OnboardingQSImport'>;

type ImportMode = 'date_range' | 'manual' | null;

const MAX_PHOTOS = 50;

const OnboardingQSImportScreen: React.FC = () => {
  const navigation = useNavigation<NavProp>();
  const route = useRoute<RoutePropT>();
  const { draft, country } = route.params;
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();

  const [mode, setMode] = useState<ImportMode>(null);
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return d;
  });
  const [endDate, setEndDate] = useState(new Date());
  const [activePicker, setActivePicker] = useState<'start' | 'end' | null>(null);
  const [pickedAssets, setPickedAssets] = useState<PickedGalleryAsset[]>([]);
  const [loading, setLoading] = useState(false);

  const handleDateRangeSearch = async () => {
    setLoading(true);
    try {
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Please allow access to your photo library to import photos.');
        setLoading(false);
        return;
      }
      const assets = await MediaLibrary.getAssetsAsync({
        mediaType: MediaLibrary.MediaType.photo,
        createdAfter: startDate.getTime(),
        createdBefore: endDate.getTime() + 86400000,
        first: MAX_PHOTOS,
        sortBy: [[MediaLibrary.SortBy.creationTime, false]],
      });
      const selected = assets.assets.slice(0, MAX_PHOTOS);
      const enriched = await Promise.all(
        selected.map(async (asset) => {
          let exif: Record<string, unknown> | null = null;
          try {
            const info = await MediaLibrary.getAssetInfoAsync(asset.id, {
              shouldDownloadFromNetwork: false,
            });
            exif = (info.exif as Record<string, unknown> | null) ?? null;
          } catch (error) {
            logger.warn('QSImport: failed to read asset info for date-range selection', {
              id: asset.id,
              error,
            });
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
      setPickedAssets(enriched);
      if (enriched.length === 0) {
        Alert.alert('No photos found', `No photos found between ${startDate.toLocaleDateString()} and ${endDate.toLocaleDateString()}. Try a different date range.`);
      }
    } catch (e) {
      logger.error('QSImport: date range fetch failed', e);
      Alert.alert('Error', 'Could not load photos. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleManualPick = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Please allow access to your photo library to import photos.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: MAX_PHOTOS,
      quality: 0.8,
      exif: true,
    });
    if (!result.canceled && result.assets.length > 0) {
      setPickedAssets(
        result.assets.map((asset) => ({
          uri: asset.uri,
          width: asset.width,
          height: asset.height,
          assetId: asset.assetId,
          exif: (asset.exif as Record<string, unknown> | null) ?? null,
        }))
      );
    }
  };

  const canProceed = pickedAssets.length > 0;

  return (
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
        <AppText style={[styles.stepLabel, { color: colors.textSecondary }]}>Step 2 of 6</AppText>
      </View>

      <View style={[styles.content, { paddingBottom: insets.bottom + 120 }]}>
        <AppText style={[styles.title, { color: colors.textPrimary }]}>Bring your memories in</AppText>
        <AppText style={[styles.subtitle, { color: colors.textSecondary }]}>{country}</AppText>

        {/* Option cards */}
        <View style={styles.cards}>
          {/* By date range */}
          <TouchableOpacity
            style={[
              styles.optCard,
              {
                backgroundColor: mode === 'date_range' ? colors.surface : colors.surface,
                borderColor: mode === 'date_range' ? colors.textPrimary : colors.border,
                borderWidth: mode === 'date_range' ? 2 : 1,
              },
            ]}
            onPress={() => { setMode('date_range'); setPickedAssets([]); }}
            activeOpacity={0.85}
          >
            <Ionicons name="calendar-outline" size={24} color={mode === 'date_range' ? colors.textPrimary : colors.textSecondary} />
            <View style={{ flex: 1 }}>
              <AppText style={[styles.optTitle, { color: colors.textPrimary }]}>By date range</AppText>
              <AppText style={[styles.optBody, { color: colors.textSecondary }]}>
                Select the dates you were there and we'll pull your photos automatically
              </AppText>
            </View>
          </TouchableOpacity>

          {/* Pick manually */}
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
              setPickedAssets([]);
              await handleManualPick();
            }}
            activeOpacity={0.85}
          >
            <Ionicons name="images-outline" size={24} color={mode === 'manual' ? colors.textPrimary : colors.textSecondary} />
            <View style={{ flex: 1 }}>
              <AppText style={[styles.optTitle, { color: colors.textPrimary }]}>Pick manually</AppText>
              <AppText style={[styles.optBody, { color: colors.textSecondary }]}>
                Choose specific photos from your gallery
              </AppText>
            </View>
          </TouchableOpacity>
        </View>

        {/* Date range pickers */}
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
              style={[styles.findBtn, { backgroundColor: colors.textPrimary, opacity: loading ? 0.6 : 1 }]}
              onPress={handleDateRangeSearch}
              disabled={loading}
              activeOpacity={0.8}
            >
              {loading ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <AppText style={[styles.findBtnText, { color: colors.background }]}>Find photos</AppText>
              )}
            </TouchableOpacity>
          </View>
        )}

        {/* Photo count feedback */}
        {pickedAssets.length > 0 && (
          <View style={[styles.countBadge, { backgroundColor: colors.surfaceVariant, borderColor: colors.textPrimary }]}>
            <Ionicons name="checkmark-circle" size={18} color={colors.textPrimary} />
            <AppText style={[styles.countText, { color: colors.textPrimary }]}>
              {pickedAssets.length} photo{pickedAssets.length !== 1 ? 's' : ''} selected
            </AppText>
          </View>
        )}
      </View>

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, SPACING.md) + SPACING.md }]}>
        <TouchableOpacity
          style={[styles.cta, { backgroundColor: colors.textPrimary, opacity: canProceed ? 1 : 0.4 }]}
          onPress={() =>
            canProceed &&
            navigation.navigate('OnboardingQSProcessing', {
              draft,
              country,
              pickedAssets,
            })
          }
          disabled={!canProceed}
          activeOpacity={0.85}
          accessibilityRole="button"
        >
          <AppText style={[styles.ctaText, { color: colors.background }]}>
            {canProceed ? `Continue with ${pickedAssets.length} photo${pickedAssets.length !== 1 ? 's' : ''} →` : 'Select photos to continue'}
          </AppText>
        </TouchableOpacity>
      </View>
    </View>
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
  content: {
    flex: 1,
    paddingHorizontal: SPACING.lg,
    gap: SPACING.lg,
  },
  title: { fontFamily: FONTS.inter, fontSize: 26, fontWeight: FONT_WEIGHTS.bold, lineHeight: 34 },
  subtitle: { fontFamily: FONTS.inter, fontSize: 15, marginTop: -SPACING.md },
  cards: { gap: SPACING.sm },
  optCard: {
    borderRadius: 12,
    padding: SPACING.md,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.sm,
  },
  optTitle: { fontFamily: FONTS.inter, fontSize: 15, fontWeight: FONT_WEIGHTS.semibold, marginBottom: 2 },
  optBody: { fontFamily: FONTS.inter, fontSize: 13, lineHeight: 18 },
  dateSection: {
    borderRadius: 12,
    borderWidth: 1,
    padding: SPACING.md,
    gap: SPACING.sm,
  },
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
  dateLabel: { fontFamily: FONTS.inter, fontSize: 14, width: 36 },
  datePill: {
    flex: 1,
    borderRadius: 8,
    borderWidth: 1,
    paddingVertical: 8,
    paddingHorizontal: SPACING.md,
  },
  datePillText: { fontFamily: FONTS.inter, fontSize: 14 },
  findBtn: {
    borderRadius: 10,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: SPACING.xs,
  },
  findBtnText: { color: '#fff', fontFamily: FONTS.inter, fontSize: 14, fontWeight: FONT_WEIGHTS.semibold },
  countBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    borderRadius: 10,
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: SPACING.md,
  },
  countText: { fontFamily: FONTS.inter, fontSize: 14, fontWeight: FONT_WEIGHTS.semibold },
  footer: { paddingHorizontal: SPACING.lg, paddingTop: SPACING.sm },
  cta: {
    borderRadius: 14,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING.md,
  },
  ctaText: { color: '#fff', fontFamily: FONTS.inter, fontSize: 15, fontWeight: FONT_WEIGHTS.semibold, textAlign: 'center' },
});

export default OnboardingQSImportScreen;
