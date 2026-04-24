// JourneyRecapPostScreen
// Post-recap screen: reflect in journal, view trip album, watch again, or back to home.

import React, { useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { FONTS, FONT_WEIGHTS, SPACING, COLORS } from '../config/constants';
import { useTheme } from '../context/ThemeContext';
import { useAppContext } from '../context/AppContext';
import { MeshGradientBackground } from '../components/common/MeshGradientBackground';
import BackArrow from '../components/common/icons/BackArrow';
import { LinearGradient } from 'expo-linear-gradient';
import type { ThemeColors } from '../config/theme';
import { logger } from '../utils/logger';

type JourneyRecapPostNavigationProp = NativeStackNavigationProp<RootStackParamList, 'JourneyRecapPost'>;
type JourneyRecapPostRouteProp = RouteProp<RootStackParamList, 'JourneyRecapPost'>;

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
    scroll: {
      flex: 1,
    },
    scrollContent: {
      paddingHorizontal: SPACING.xl,
      paddingBottom: insets.bottom + 80,
      paddingTop: SPACING.lg,
    },
    title: {
      fontFamily: FONTS.inter,
      fontSize: 22,
      fontWeight: FONT_WEIGHTS.semibold,
      color: colors.textPrimary,
      textAlign: 'center',
      marginBottom: SPACING.xs,
    },
    subtitle: {
      fontFamily: FONTS.inter,
      fontSize: 16,
      color: colors.textSecondary,
      textAlign: 'center',
      marginBottom: SPACING.xxl,
    },
    primaryButton: {
      position: 'relative',
      paddingVertical: SPACING.md,
      paddingHorizontal: SPACING.xl,
      borderRadius: 12,
      marginTop: SPACING.md,
      overflow: 'hidden',
    },
    primaryButtonText: {
      fontFamily: FONTS.inter,
      fontSize: 16,
      fontWeight: FONT_WEIGHTS.semibold,
      color: COLORS.white,
    },
    backToHomeWrap: {
      marginTop: SPACING.xxl,
      alignItems: 'center',
    },
    backToHomeText: {
      fontFamily: FONTS.inter,
      fontSize: 15,
      color: colors.textSecondary,
    },
    centerContent: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: SPACING.xl,
    },
    errorText: {
      fontFamily: FONTS.inter,
      fontSize: 16,
      color: colors.textPrimary,
      textAlign: 'center',
      marginBottom: SPACING.lg,
    },
  });
}

const JourneyRecapPostScreen: React.FC = () => {
  const navigation = useNavigation<JourneyRecapPostNavigationProp>();
  const route = useRoute<JourneyRecapPostRouteProp>();
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const { tripAlbums } = useAppContext();
  const albumId = route.params?.albumId;
  const album = useMemo(
    () => (albumId && tripAlbums ? tripAlbums.find((a) => a.id === albumId) : null),
    [albumId, tripAlbums]
  );
  const hasError = !albumId || !album;

  const handleBack = useCallback(() => {
    try {
      navigation.goBack();
    } catch (e) {
      logger.warn('JourneyRecapPostScreen: goBack failed', e);
    }
  }, [navigation]);

  const handleBackToHome = useCallback(() => {
    try {
      navigation.navigate('MainTabs', { screen: 'Home' });
    } catch (e) {
      logger.warn('JourneyRecapPostScreen: navigate to Home failed', e);
      navigation.goBack();
    }
  }, [navigation]);

  const handleReflect = useCallback(() => {
    if (!albumId) return;
    try {
      navigation.navigate('NotesEditor', { albumId });
    } catch (e) {
      logger.warn('JourneyRecapPostScreen: navigate to NotesEditor failed', e);
    }
  }, [navigation, albumId]);

  const handleViewTripAlbum = useCallback(() => {
    if (!albumId) return;
    try {
      navigation.navigate('TripAlbumDetail', { albumId });
    } catch (e) {
      logger.warn('JourneyRecapPostScreen: navigate to TripAlbumDetail failed', e);
    }
  }, [navigation, albumId]);

  const handleWatchAgain = useCallback(() => {
    if (!albumId) return;
    try {
      navigation.navigate('JourneyRecapPlayer', { albumId });
    } catch (e) {
      logger.warn('JourneyRecapPostScreen: navigate to JourneyRecapPlayer failed', e);
    }
  }, [navigation, albumId]);

  const styles = useMemo(() => createStyles(colors as ThemeColors, insets), [colors, insets]);

  if (hasError) {
    return (
      <View style={styles.container}>
        <MeshGradientBackground baseColor={colors.background} lightMode={!isDark} />
        <View style={styles.header}>
          <TouchableOpacity onPress={handleBack} style={styles.backButton} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel="Go back">
            <BackArrow color={colors.textPrimary} width={24} height={24} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Back</Text>
        </View>
        <View style={styles.centerContent}>
          <Text style={styles.errorText}>Trip not found.</Text>
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={handleBackToHome}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Back to home"
          >
            <LinearGradient
              colors={[COLORS.babyBlue, COLORS.royalGold, COLORS.fern]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={[StyleSheet.absoluteFillObject, { borderRadius: 12 }]}
            />
            <Text style={styles.primaryButtonText}>Back to home</Text>
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
        <Text style={styles.headerTitle}>Back</Text>
      </View>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>{"What's next?"}</Text>
        <Text style={styles.subtitle}>Your recap is complete.</Text>
        <TouchableOpacity
          style={styles.primaryButton}
          onPress={handleReflect}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Reflect on your trip"
        >
          <LinearGradient
            colors={[COLORS.babyBlue, COLORS.royalGold, COLORS.fern]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={[StyleSheet.absoluteFillObject, { borderRadius: 12 }]}
          />
          <Text style={styles.primaryButtonText}>Reflect on your trip</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.primaryButton}
          onPress={handleViewTripAlbum}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="View trip album"
        >
          <LinearGradient
            colors={[COLORS.babyBlue, COLORS.royalGold, COLORS.fern]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={[StyleSheet.absoluteFillObject, { borderRadius: 12 }]}
          />
          <Text style={styles.primaryButtonText}>View trip album</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.primaryButton}
          onPress={handleWatchAgain}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Watch again"
        >
          <LinearGradient
            colors={[COLORS.babyBlue, COLORS.royalGold, COLORS.fern]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={[StyleSheet.absoluteFillObject, { borderRadius: 12 }]}
          />
          <Text style={styles.primaryButtonText}>Watch again</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.backToHomeWrap}
          onPress={handleBackToHome}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Back to home"
        >
          <Text style={styles.backToHomeText}>Back to home</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
};

export default JourneyRecapPostScreen;
