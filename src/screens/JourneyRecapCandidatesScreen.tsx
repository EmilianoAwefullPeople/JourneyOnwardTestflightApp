// JourneyRecapCandidatesScreen
// Journey Recap: loading, then list of recap-capable trip albums; tap one to open recap player.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { FONTS, FONT_WEIGHTS, SPACING, COLORS, DIMENSIONS } from '../config/constants';
import { useTheme } from '../context/ThemeContext';
import { LinearGradient } from 'expo-linear-gradient';
import type { ThemeColors } from '../config/theme';
import { MeshGradientBackground } from '../components/common/MeshGradientBackground';
import BackArrow from '../components/common/icons/BackArrow';
import { Ionicons } from '@expo/vector-icons';
import { useAppContext } from '../context/AppContext';
import { logger } from '../utils/logger';
import { getRecapCandidates } from '../utils/recapCandidates';
import type { RecapCandidate } from '../models/Recap';
import LoadingSpinner from '../components/common/LoadingSpinner';

type JourneyRecapCandidatesNavigationProp = NativeStackNavigationProp<RootStackParamList, 'JourneyRecapCandidates'>;

type ScreenState = 'loading' | 'list' | 'empty' | 'error';

function createStyles(colors: ThemeColors, insets: { top: number; bottom: number }) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: SPACING.md,
      paddingTop: insets.top + SPACING.sm,
      paddingBottom: SPACING.md,
    },
    backButton: {
      marginRight: SPACING.sm,
    },
    headerTitle: {
      fontFamily: FONTS.inter,
      fontSize: 18,
      fontWeight: FONT_WEIGHTS.semibold,
      color: colors.textPrimary,
    },
    centerContent: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: SPACING.xl,
    },
    loadingText: {
      fontFamily: FONTS.inter,
      fontSize: 16,
      color: colors.textSecondary,
      marginTop: SPACING.lg,
    },
    errorText: {
      fontFamily: FONTS.inter,
      fontSize: 16,
      color: colors.textPrimary,
      textAlign: 'center',
      marginTop: SPACING.lg,
    },
    emptyTitle: {
      fontFamily: FONTS.inter,
      fontSize: 18,
      fontWeight: FONT_WEIGHTS.semibold,
      color: colors.textPrimary,
      marginBottom: SPACING.sm,
      textAlign: 'center',
    },
    emptySubtext: {
      fontFamily: FONTS.inter,
      fontSize: 15,
      color: colors.textSecondary,
      textAlign: 'center',
      marginBottom: SPACING.xl,
    },
    primaryButton: {
      position: 'relative',
      paddingVertical: SPACING.md,
      paddingHorizontal: SPACING.xl,
      borderRadius: 12,
      marginTop: SPACING.lg,
      overflow: 'hidden',
    },
    primaryButtonText: {
      fontFamily: FONTS.inter,
      fontSize: 16,
      fontWeight: FONT_WEIGHTS.semibold,
      color: colors.white,
    },
    secondaryButton: {
      marginTop: SPACING.sm,
      paddingVertical: SPACING.sm,
    },
    secondaryButtonText: {
      fontFamily: FONTS.inter,
      fontSize: 15,
      color: colors.textSecondary,
    },
    scroll: {
      flex: 1,
    },
    scrollContent: {
      paddingHorizontal: SPACING.md,
      paddingBottom: (Number.isFinite(insets.bottom) ? insets.bottom : 0) + 80,
    },
    card: {
      marginBottom: SPACING.md,
      borderRadius: DIMENSIONS.cardBorderRadius ?? 12,
      borderWidth: 2,
      overflow: 'hidden',
    },
    cardInner: {
      flexDirection: 'row',
      padding: SPACING.md,
      alignItems: 'center',
    },
    cardThumbnails: {
      width: 72,
      height: 72,
      borderRadius: 8,
      overflow: 'hidden',
      flexDirection: 'row',
    },
    cardThumb: {
      flex: 1,
    },
    cardTextWrap: {
      flex: 1,
      marginLeft: SPACING.md,
    },
    cardTitle: {
      fontFamily: FONTS.inter,
      fontSize: 16,
      fontWeight: FONT_WEIGHTS.semibold,
      color: colors.textPrimary,
    },
    cardDate: {
      fontFamily: FONTS.inter,
      fontSize: 13,
      color: colors.textSecondary,
      marginTop: 2,
    },
    cardChevron: {
      marginLeft: SPACING.sm,
    },
  });
}

const JourneyRecapCandidatesScreen: React.FC = () => {
  const navigation = useNavigation<JourneyRecapCandidatesNavigationProp>();
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const { entries, tripAlbums } = useAppContext();

  const [state, setState] = useState<ScreenState>('loading');
  const [candidates, setCandidates] = useState<RecapCandidate[]>([]);
  const [errorMessage, setErrorMessage] = useState<string>('');

  const loadCandidates = useCallback(() => {
    setState('loading');
    setErrorMessage('');
    try {
      const list = getRecapCandidates(entries ?? [], tripAlbums ?? []);
      setCandidates(list);
      if (list.length === 0) setState('empty');
      else setState('list');
    } catch (e) {
      logger.error('JourneyRecapCandidatesScreen: getRecapCandidates failed', e);
      setErrorMessage('Could not load your trips.');
      setState('error');
    }
  }, [entries, tripAlbums]);

  useEffect(() => {
    loadCandidates();
  }, [loadCandidates]);

  const handleBack = useCallback(() => {
    try {
      navigation.goBack();
    } catch (e) {
      logger.warn('JourneyRecapCandidatesScreen: goBack failed', e);
    }
  }, [navigation]);

  const handleCreateAlbum = useCallback(() => {
    try {
      navigation.navigate('TripAlbumCreate');
    } catch (e) {
      logger.warn('JourneyRecapCandidatesScreen: navigate TripAlbumCreate failed', e);
    }
  }, [navigation]);

  const handleSelectCandidate = useCallback(
    (c: RecapCandidate) => {
      try {
        navigation.navigate('JourneyRecapPlayer', { albumId: c.id });
      } catch (e) {
        logger.warn('JourneyRecapCandidatesScreen: navigate JourneyRecapPlayer failed', e);
      }
    },
    [navigation]
  );

  const styles = useMemo(() => createStyles(colors as ThemeColors, insets), [colors, insets]);

  if (state === 'loading') {
    return (
      <View style={styles.container}>
        <MeshGradientBackground baseColor={colors.background} lightMode={!isDark} />
        <View style={styles.header}>
          <TouchableOpacity onPress={handleBack} style={styles.backButton} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel="Go back">
            <BackArrow color={colors.textPrimary} width={24} height={24} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Journey Recap</Text>
        </View>
        <View style={styles.centerContent}>
          <LoadingSpinner size="large" />
          <Text style={styles.loadingText}>Finding your trips…</Text>
        </View>
      </View>
    );
  }

  if (state === 'error') {
    return (
      <View style={styles.container}>
        <MeshGradientBackground baseColor={colors.background} lightMode={!isDark} />
        <View style={styles.header}>
          <TouchableOpacity onPress={handleBack} style={styles.backButton} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel="Go back">
            <BackArrow color={colors.textPrimary} width={24} height={24} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Journey Recap</Text>
        </View>
        <View style={styles.centerContent}>
          <Ionicons name="alert-circle-outline" size={48} color={colors.textSecondary} />
          <Text style={styles.errorText}>{errorMessage}</Text>
          <TouchableOpacity style={styles.primaryButton} onPress={loadCandidates} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel="Retry">
            <LinearGradient
              colors={[COLORS.babyBlue, COLORS.royalGold, COLORS.fern]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={[StyleSheet.absoluteFillObject, { borderRadius: 12 }]}
            />
            <Text style={styles.primaryButtonText}>Retry</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryButton} onPress={handleBack} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel="Go back">
            <Text style={styles.secondaryButtonText}>Back</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (state === 'empty') {
    return (
      <View style={styles.container}>
        <MeshGradientBackground baseColor={colors.background} lightMode={!isDark} />
        <View style={styles.header}>
          <TouchableOpacity onPress={handleBack} style={styles.backButton} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel="Go back">
            <BackArrow color={colors.textPrimary} width={24} height={24} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Journey Recap</Text>
        </View>
        <View style={styles.centerContent}>
          <Ionicons name="images-outline" size={48} color={colors.textSecondary} />
          <Text style={styles.emptyTitle}>No trips to recap yet</Text>
          <Text style={styles.emptySubtext}>Add a trip album and experiences to get your first recap.</Text>
          <TouchableOpacity style={styles.primaryButton} onPress={handleCreateAlbum} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel="Create a trip album">
            <LinearGradient
              colors={[COLORS.babyBlue, COLORS.royalGold, COLORS.fern]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={[StyleSheet.absoluteFillObject, { borderRadius: 12 }]}
            />
            <Text style={styles.primaryButtonText}>Create a trip album</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryButton} onPress={handleBack} activeOpacity={0.7}>
            <Text style={styles.secondaryButtonText}>Back</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <MeshGradientBackground baseColor={colors.background} lightMode={!isDark} />
      <View style={styles.header}>
        <TouchableOpacity onPress={handleBack} style={styles.backButton} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel="Go back">
          <BackArrow color={colors.textPrimary} width={24} height={24} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Journey Recap</Text>
      </View>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator>
        {candidates.map((c) => (
          <TouchableOpacity
            key={c.id}
            style={[styles.card, { borderColor: colors.borderLight }]}
            onPress={() => handleSelectCandidate(c)}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel={`Recap for ${c.displayName}`}
          >
            <View style={[styles.cardInner, { backgroundColor: colors.surfaceVariant }]}>
              <View style={styles.cardThumbnails}>
                {c.previewImageUris.length > 0 ? (
                  c.previewImageUris.slice(0, 2).map((uri, i) => (
                    <Image key={i} source={{ uri }} style={styles.cardThumb} resizeMode="cover" />
                  ))
                ) : (
                  <View style={[styles.cardThumb, { backgroundColor: colors.surface }]} />
                )}
              </View>
              <View style={styles.cardTextWrap}>
                <Text style={styles.cardTitle} numberOfLines={2}>
                  {c.displayName}
                </Text>
                <Text style={styles.cardDate} numberOfLines={1}>
                  {c.dateRange}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={22} color={colors.textSecondary} style={styles.cardChevron} />
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
};

export default JourneyRecapCandidatesScreen;
