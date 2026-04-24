import React, { useMemo, useRef } from 'react';
import { View, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import AppText from '../components/common/AppText';
import { useTheme } from '../context/ThemeContext';
import { useAppContext } from '../context/AppContext';
import { RootStackParamList } from '../navigation/types';
import { FONTS, FONT_WEIGHTS, SPACING } from '../config/constants';
import { getEffectiveMainTabInset } from '../navigation/mainTabBarMetrics';
import { useMainTabBarVisibility } from '../navigation/mainTabBarVisibility';
import StudioQuickActions from '../components/studio/StudioQuickActions';
import StudioJourneyRecapRow from '../components/studio/StudioJourneyRecapRow';
import StudioPostcardsRow from '../components/studio/StudioPostcardsRow';
import StudioAddMoreDetails from '../components/studio/StudioAddMoreDetails';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const SETTINGS_SIZE = 40;
const SECTION_GAP = 32;

function getTimeGreeting(): string {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return 'Good morning';
  if (hour >= 12 && hour < 17) return 'Good afternoon';
  if (hour >= 17 && hour < 21) return 'Good evening';
  return 'Good night';
}

const StudioScreen: React.FC = () => {
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { userName } = useAppContext();
  const { visibilityProgress, reportScrollOffset } = useMainTabBarVisibility();
  const sessionSeedRef = useRef<string>(`${Date.now()}-${Math.random().toString(36).slice(2)}`);

  const greeting = useMemo(() => {
    const base = getTimeGreeting();
    const name = userName?.trim();
    return name ? `${base}, ${name}` : base;
  }, [userName]);

  const tabInset = getEffectiveMainTabInset(insets.bottom, visibilityProgress);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: {
          flex: 1,
          backgroundColor: colors.background,
        },
        scrollContent: {
          paddingTop: insets.top + 16,
          paddingHorizontal: SPACING.lg,
          paddingBottom: tabInset + SPACING.xl,
        },
        settingsButton: {
          alignSelf: 'flex-start',
          width: SETTINGS_SIZE,
          height: SETTINGS_SIZE,
          borderRadius: SETTINGS_SIZE / 2,
          backgroundColor: colors.surfaceVariant,
          borderWidth: 1,
          borderColor: colors.border,
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 16,
        },
        greeting: {
          fontFamily: FONTS.inter,
          fontSize: 28,
          fontWeight: FONT_WEIGHTS.bold,
          color: colors.textPrimary,
          lineHeight: 34,
          marginBottom: SECTION_GAP,
        },
        section: {
          marginBottom: SECTION_GAP,
        },
      }),
    [colors, insets.top, tabInset]
  );

  return (
    <View style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        onScroll={(e) => reportScrollOffset(e.nativeEvent.contentOffset.y)}
        scrollEventThrottle={16}
      >
        <TouchableOpacity
          style={styles.settingsButton}
          onPress={() => navigation.navigate('Settings')}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Open settings"
        >
          <Ionicons name="settings-outline" size={22} color={colors.textPrimary} />
        </TouchableOpacity>

        <AppText style={styles.greeting}>{greeting}</AppText>

        <View style={styles.section}>
          <StudioQuickActions />
        </View>

        <View style={styles.section}>
          <StudioJourneyRecapRow />
        </View>

        <View style={styles.section}>
          <StudioPostcardsRow sessionSeed={sessionSeedRef.current} />
        </View>

        <View style={styles.section}>
          <StudioAddMoreDetails sessionSeed={sessionSeedRef.current} />
        </View>
      </ScrollView>
    </View>
  );
};

export default StudioScreen;
