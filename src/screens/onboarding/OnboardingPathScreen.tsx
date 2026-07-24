// OnboardingPathScreen — path selection (Phase 2)
// Three options: unpack a past trip, start a current trip, or explore freely.
// Marks onboarding complete and resets nav stack to the chosen destination.

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { RootStackParamList } from '../../navigation/types';
import { COLORS, FONTS, FONT_WEIGHTS, SPACING } from '../../config/constants';
import { useTheme } from '../../context/ThemeContext';
import { useAppContext } from '../../context/AppContext';

type NavProp = NativeStackNavigationProp<RootStackParamList>;
type OnboardingPath = 'unpack' | 'trip_album' | 'explore';

interface PathOption {
  id: OnboardingPath;
  headline: string;
  subtext: string;
  icon: keyof typeof Ionicons.glyphMap;
  featured: boolean;
  destination: keyof RootStackParamList;
}

const PATH_OPTIONS: PathOption[] = [
  {
    id: 'unpack',
    headline: 'I have travel memories',
    subtext: 'Import your photos and get them organized into a trip.',
    icon: 'sparkles',
    featured: true,
    destination: 'UnpackTripDetails',
  },
  {
    id: 'trip_album',
    headline: "I'm on a trip (or planning one)",
    subtext: 'Create your trip album and start capturing as you go.',
    icon: 'book-outline',
    featured: false,
    destination: 'TripAlbumCreate',
  },
  {
    id: 'explore',
    headline: 'Just looking around',
    subtext: 'Jump in and explore at your own pace.',
    icon: 'compass-outline',
    featured: false,
    destination: 'MainTabs',
  },
];

const OnboardingPathScreen: React.FC = () => {
  const navigation = useNavigation<NavProp>();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { completeOnboarding, setPendingOnboardingPath } = useAppContext();

  const handleSelect = async (option: PathOption) => {
    if (option.id === 'explore') {
      await completeOnboarding('explore');
      navigation.reset({ index: 0, routes: [{ name: 'MainTabs' }] });
    } else {
      // paths 1 & 2: defer completion until the flow finishes
      setPendingOnboardingPath(option.id);
      navigation.navigate(option.destination as any);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingTop: insets.top + 48, paddingBottom: insets.bottom + 32 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Brand header — continuity from slides */}
        <View style={styles.brandHeader}>
          <Text style={[styles.brandName, { color: colors.textSecondary }]}>
            Journey Onward
          </Text>
        </View>

        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.textPrimary }]}>
            Where are you right now?
          </Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            {'The right starting point is here.'}

          </Text>
        </View>

        <View style={styles.cards}>
          {PATH_OPTIONS.map((option) =>
            option.featured ? (
              <FeaturedCard key={option.id} option={option} colors={colors} onPress={() => handleSelect(option)} />
            ) : (
              <StandardCard key={option.id} option={option} colors={colors} onPress={() => handleSelect(option)} />
            ),
          )}
        </View>
      </ScrollView>
    </View>
  );
};

const FeaturedCard: React.FC<{
  option: PathOption;
  colors: any;
  onPress: () => void;
}> = ({ option, colors, onPress }) => (
  <LinearGradient
    colors={[COLORS.babyBlue, COLORS.royalGold, COLORS.fern]}
    start={{ x: 0, y: 0 }}
    end={{ x: 1, y: 1 }}
    style={styles.featuredGradientBorder}
  >
    <TouchableOpacity
      style={[styles.card, styles.featuredCardInner, { backgroundColor: colors.surfaceVariant }]}
      onPress={onPress}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityLabel={option.headline}
    >
      <View style={[styles.iconWrap, { backgroundColor: COLORS.royalGold + '22' }]}>
        <Ionicons name={option.icon} size={22} color={COLORS.royalGold} />
      </View>
      <View style={styles.textBlock}>
        <Text style={[styles.cardHeadline, { color: colors.textPrimary }]}>{option.headline}</Text>
        <Text style={[styles.cardSubtext, { color: colors.textSecondary }]}>{option.subtext}</Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
    </TouchableOpacity>
  </LinearGradient>
);

const StandardCard: React.FC<{
  option: PathOption;
  colors: any;
  onPress: () => void;
}> = ({ option, colors, onPress }) => (
  <TouchableOpacity
    style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 }]}
    onPress={onPress}
    activeOpacity={0.8}
    accessibilityRole="button"
    accessibilityLabel={option.headline}
  >
    <View style={[styles.iconWrap, { backgroundColor: colors.surfaceVariant }]}>
      <Ionicons name={option.icon} size={22} color={colors.textPrimary} />
    </View>
    <View style={styles.textBlock}>
      <Text style={[styles.cardHeadline, { color: colors.textPrimary }]}>{option.headline}</Text>
      <Text style={[styles.cardSubtext, { color: colors.textSecondary }]}>{option.subtext}</Text>
    </View>
    <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
  </TouchableOpacity>
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scroll: {
    paddingHorizontal: SPACING.lg,
    gap: 0,
  },
  brandHeader: {
    marginBottom: 20,
  },
  brandName: {
    fontFamily: FONTS.playfairDisplay,
    fontSize: 14,
    letterSpacing: 0.6,
  },
  header: {
    marginBottom: 36,
    gap: 8,
  },
  title: {
    fontFamily: FONTS.playfairDisplay,
    fontSize: 32,
    lineHeight: 40,
    letterSpacing: -0.3,
  },
  subtitle: {
    fontFamily: FONTS.inter,
    fontSize: 16,
    fontWeight: FONT_WEIGHTS.regular as any,
    lineHeight: 22,
  },
  cards: {
    gap: 12,
  },
  featuredGradientBorder: {
    borderRadius: 18,
    padding: 1.5,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    paddingHorizontal: SPACING.md,
    paddingVertical: 18,
    gap: 14,
  },
  featuredCardInner: {
    borderRadius: 16,
  },
  iconWrap: {
    width: 46,
    height: 46,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  textBlock: {
    flex: 1,
    gap: 4,
  },
  cardHeadline: {
    fontFamily: FONTS.inter,
    fontSize: 16,
    fontWeight: FONT_WEIGHTS.semibold as any,
    lineHeight: 22,
  },
  cardSubtext: {
    fontFamily: FONTS.inter,
    fontSize: 13,
    fontWeight: FONT_WEIGHTS.regular as any,
    lineHeight: 18,
  },
});

export default OnboardingPathScreen;
