// App Navigator
// Main navigation structure with deferred initialization to prevent boolean/string errors

import React, { useMemo, useEffect, useRef, useCallback } from 'react';
import { View, StyleSheet, Text, TouchableOpacity, Animated, Easing, PanResponder } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';

// DO NOT import React Navigation modules at top level - they trigger native module registration
// DO NOT import screen components at top level - lazy-load them instead

import { RootStackParamList, MainTabParamList } from './types';
import { COLORS, DIMENSIONS, FONTS, FONT_WEIGHTS, SPACING } from '../config/constants';
import { TEXT_STYLES } from '../config/typography';
import { useAppContext } from '../context/AppContext';
import { useTheme } from '../context/ThemeContext';
import { useReduceMotion } from '../hooks/useReduceMotion';
import { MAIN_TAB_BAR_HOME_INDICATOR_MIN } from './mainTabBarMetrics';
import { MainTabBarVisibilityProvider, useMainTabBarVisibilityController } from './mainTabBarVisibility';

const ActiveIndicator: React.FC<{ width: number }> = ({ width }) => {
  const progress = useRef(new Animated.Value(0)).current;
  const reduceMotion = useReduceMotion();

  useEffect(() => {
    if (reduceMotion) {
      progress.setValue(1);
      return;
    }
    progress.setValue(0);
    Animated.timing(progress, {
      toValue: 1,
      duration: 240,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [progress, width, reduceMotion]);

  return (
    <View style={[styles.activeIndicator, { width }]}>
      <Animated.View
        style={[
          styles.activeIndicatorFillWrapper,
          { width, transform: [{ scaleX: progress }] },
        ]}
      >
        <LinearGradient
          colors={[COLORS.babyBlue, COLORS.royalGold, COLORS.fern]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.activeIndicatorGradient}
        />
      </Animated.View>
    </View>
  );
};

// Navigator result types (require() returns untyped; type the result so Tab/Stack are usable)
interface TabNavigatorResult {
  Navigator: React.ComponentType<any>;
  Screen: React.ComponentType<any>;
}
interface StackNavigatorResult {
  Navigator: React.ComponentType<any>;
  Screen: React.ComponentType<any>;
}

/**
 * Metro must see string literals inside `require(...)` (no `require(variable)`).
 * Callers pass the result of a literal-path `require` and we resolve `default` safely.
 */
function screenFromModule(mod: unknown, debugName: string): React.ComponentType<any> {
  if (mod == null) {
    throw new Error(`JourneyOn: empty module for ${debugName}`);
  }
  const m = mod as { default?: React.ComponentType<any> };
  const C = m.default ?? (mod as React.ComponentType<any>);
  if (typeof C !== 'function') {
    throw new Error(`JourneyOn: screen ${debugName} has no component export`);
  }
  return C;
}

// Main Tab Navigator - Lazy loaded to avoid initialization at module import time
const MainTabs = () => {
  // Lazy-load createBottomTabNavigator only when component renders
  const createBottomTabNavigator = require('@react-navigation/bottom-tabs').createBottomTabNavigator;
  const stackNavigation = require('@react-navigation/native').useNavigation();

  // State to store text widths for active indicator
  const [textWidths, setTextWidths] = React.useState<{ [key: string]: number }>({});

  // Plus menu state
  const [plusMenuOpen, setPlusMenuOpen] = React.useState(false);
  const menuOverlayOpacity = useRef(new Animated.Value(0)).current;
  const menuTranslateY = useRef(new Animated.Value(280)).current;

  const HomeScreen = useMemo(() => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return screenFromModule(require('../screens/HomeScreen'), 'HomeScreen');
  }, []);
  const ReviewScreen = useMemo(() => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return screenFromModule(require('../screens/ReviewScreen'), 'ReviewScreen');
  }, []);

  // Create Tab navigator inside component to defer initialization
  const Tab = useMemo(() => createBottomTabNavigator() as TabNavigatorResult, []);

  // Get safe area insets for proper home indicator spacing
  const insets = useSafeAreaInsets();

  const { colors } = useTheme();
  const { travelModeEnabled, activeTripAlbums } = useAppContext();
  const isTravelModeActive = travelModeEnabled && activeTripAlbums.length > 0;
  const { hidden, visibilityProgress, setActiveRouteKey } = useMainTabBarVisibilityController();
  const tabBarTranslateY = useRef(new Animated.Value(0)).current;

  const stateRef = useRef<any>(null);
  const tabBarHeight = DIMENSIONS.bottomNavHeight + Math.max(insets.bottom, MAIN_TAB_BAR_HOME_INDICATOR_MIN);

  const openPlusMenu = useCallback(() => {
    setPlusMenuOpen(true);
    menuOverlayOpacity.setValue(0);
    menuTranslateY.setValue(280);
    Animated.parallel([
      Animated.timing(menuOverlayOpacity, {
        toValue: 1, duration: 220,
        easing: Easing.out(Easing.cubic), useNativeDriver: true,
      }),
      Animated.timing(menuTranslateY, {
        toValue: 0, duration: 260,
        easing: Easing.bezier(0.22, 1, 0.36, 1), useNativeDriver: true,
      }),
    ]).start();
  }, [menuOverlayOpacity, menuTranslateY]);

  const closePlusMenu = useCallback(() => {
    setPlusMenuOpen(false);
    Animated.parallel([
      Animated.timing(menuOverlayOpacity, {
        toValue: 0, duration: 200,
        easing: Easing.out(Easing.cubic), useNativeDriver: true,
      }),
      Animated.timing(menuTranslateY, {
        toValue: 280, duration: 200,
        easing: Easing.in(Easing.cubic), useNativeDriver: true,
      }),
    ]).start();
  }, [menuOverlayOpacity, menuTranslateY]);

  const handlePlusMenuAction = useCallback((screen: string) => {
    closePlusMenu();
    setTimeout(() => (stackNavigation as any).navigate(screen), 100);
  }, [closePlusMenu, stackNavigation]);

  const dragPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, { dy }) => Math.abs(dy) > 3,
      onPanResponderMove: (_, { dy }) => {
        if (dy > 0) menuTranslateY.setValue(dy);
      },
      onPanResponderRelease: (_, { dy, vy }) => {
        if (dy > 72 || vy > 1.0) {
          setPlusMenuOpen(false);
          Animated.parallel([
            Animated.timing(menuOverlayOpacity, { toValue: 0, duration: 200, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
            Animated.timing(menuTranslateY, { toValue: 280, duration: 200, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
          ]).start();
        } else {
          Animated.spring(menuTranslateY, { toValue: 0, useNativeDriver: true, tension: 120, friction: 9 }).start();
        }
      },
      onPanResponderTerminate: () => {
        Animated.spring(menuTranslateY, { toValue: 0, useNativeDriver: true }).start();
      },
    })
  ).current;

  useEffect(() => {
    tabBarTranslateY.stopAnimation();
    Animated.timing(tabBarTranslateY, {
      toValue: hidden ? tabBarHeight : 0,
      duration: hidden ? 260 : 280,
      easing: hidden
        ? Easing.out(Easing.cubic)
        : Easing.bezier(0.22, 1, 0.36, 1), // smoother ease-out on reveal
      useNativeDriver: true,
    }).start();
  }, [hidden, tabBarHeight, tabBarTranslateY]);

  // Custom tab bar with green underline for active tab
  const CustomTabBar = ({ state, descriptors, navigation }: any) => {
    stateRef.current = state;
    const activeRouteKey = state?.routes?.[state.index]?.key;
    if (activeRouteKey) {
      setActiveRouteKey(activeRouteKey);
    }

    return (
      <Animated.View
        pointerEvents={hidden ? 'none' : 'auto'}
        style={[
          styles.tabBarOverlay,
          {
            backgroundColor: colors.background,
            borderTopColor: colors.border,
            paddingBottom: Math.max(insets.bottom, MAIN_TAB_BAR_HOME_INDICATOR_MIN),
            transform: [{ translateY: tabBarTranslateY }],
            opacity: visibilityProgress === 0 ? 0.98 : 1,
          },
        ]}
      >
        <View style={styles.tabBarContainer}>
          {state.routes.map((route: any, index: number) => {
            const { options } = descriptors[route.key];
            const label = options.tabBarLabel !== undefined
              ? options.tabBarLabel
              : options.title !== undefined
                ? options.title
                : route.name;
            const isFocused = state.index === index;

            const onPress = () => {
              const event = navigation.emit({
                type: 'tabPress',
                target: route.key,
                canPreventDefault: true,
              });

              if (!isFocused && !event.defaultPrevented) {
                navigation.navigate(route.name);
              }
            };

            const onLongPress = () => {
              navigation.emit({
                type: 'tabLongPress',
                target: route.key,
              });
            };

            return (
              <React.Fragment key={route.key}>
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityState={isFocused ? { selected: true } : {}}
                  accessibilityLabel={options.tabBarAccessibilityLabel}
                  testID={options.tabBarTestID}
                  onPress={onPress}
                  onLongPress={onLongPress}
                  style={styles.tabButton}
                >
                  <View style={styles.tabLabelContainer}>
                    <Text
                      style={[
                        styles.tabLabel,
                        { color: (isFocused && !plusMenuOpen) ? colors.textPrimary : colors.textSecondary },
                      ]}
                      maxFontSizeMultiplier={1.3}
                      numberOfLines={1}
                      onLayout={(e) => {
                        // Store text width for indicator matching
                        const width = e.nativeEvent.layout.width;
                        if (width > 0 && textWidths[route.key] !== width) {
                          setTextWidths(prev => ({ ...prev, [route.key]: width }));
                        }
                      }}
                    >
                      {label}
                    </Text>
                    {isFocused && !plusMenuOpen && (
                      <ActiveIndicator width={textWidths[route.key] ?? 55} />
                    )}
                  </View>
                </TouchableOpacity>
                {index === 0 && (
                  <TouchableOpacity
                    onPress={plusMenuOpen ? closePlusMenu : openPlusMenu}
                    activeOpacity={0.85}
                    accessibilityRole="button"
                    accessibilityLabel={plusMenuOpen ? 'Close create menu' : 'Create new'}
                    style={styles.plusButtonWrapper}
                  >
                    <LinearGradient
                      colors={plusMenuOpen
                        ? [COLORS.babyBlue, COLORS.royalGold, COLORS.fern]
                        : [colors.border, colors.border] as any}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={styles.plusButtonGradientBorder}
                    >
                      <View style={[styles.plusButtonInner, { backgroundColor: plusMenuOpen ? '#FFFFFF' : colors.surfaceVariant }]}>
                        <Ionicons
                          name="add"
                          size={26}
                          color={plusMenuOpen ? '#111111' : colors.textPrimary}
                        />
                      </View>
                    </LinearGradient>
                  </TouchableOpacity>
                )}
              </React.Fragment>
            );
          })}
        </View>
      </Animated.View>
    );
  };

  return (
    <View style={{ flex: 1 }}>
      <Tab.Navigator
        initialRouteName="Home"
        screenOptions={{
          headerShown: false,
          tabBarStyle: { display: 'none' },
          lazy: true,
          unmountOnBlur: false,
        }}
        tabBar={CustomTabBar}
      >
        <Tab.Screen
          name="Home"
          component={HomeScreen}
          options={{
            tabBarLabel: 'Home',
            tabBarAccessibilityLabel: 'Home tab',
          }}
        />
        <Tab.Screen
          name="Review"
          component={ReviewScreen}
          options={{
            tabBarLabel: 'Review',
            tabBarAccessibilityLabel: 'Review tab',
          }}
        />
      </Tab.Navigator>

      {/* Dimming overlay — sits above content (z 1800), below tab bar (z 2000) */}
      <Animated.View
        pointerEvents={plusMenuOpen ? 'auto' : 'none'}
        style={[
          StyleSheet.absoluteFillObject,
          { backgroundColor: 'rgba(0,0,0,0.65)', zIndex: 1800, opacity: menuOverlayOpacity },
        ]}
      >
        <TouchableOpacity
          style={StyleSheet.absoluteFillObject}
          onPress={closePlusMenu}
          activeOpacity={1}
        />
      </Animated.View>

      {/* Plus menu — Option A: bottom sheet */}
      <Animated.View
        pointerEvents={plusMenuOpen ? 'box-none' : 'none'}
        style={[
          styles.plusMenuContainer,
          {
            bottom: tabBarHeight,
            zIndex: 1900,
            opacity: menuOverlayOpacity,
            transform: [{ translateY: menuTranslateY }],
            backgroundColor: colors.surface,
          },
        ]}
      >
        {/* Drag handle — touch area is taller than the visible pill for easy grabbing */}
        <View style={styles.plusMenuHandleArea} {...dragPanResponder.panHandlers}>
          <View style={[styles.plusMenuHandle, { backgroundColor: colors.border }]} />
        </View>

        {/* Featured: Unpack A Trip — top priority, hidden while travel mode is active (unpacking is a post-trip action) */}
        {!isTravelModeActive && (
          <View style={styles.plusMenuFeaturedSection}>
            <LinearGradient
              colors={[COLORS.babyBlue, COLORS.royalGold, COLORS.lime800]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.plusMenuFeaturedGradientBorder}
            >
            <TouchableOpacity
              style={[
                styles.plusMenuFeaturedCard,
                { backgroundColor: colors.surfaceVariant },
              ]}
              onPress={() => handlePlusMenuAction('UnpackTripDetails')}
              activeOpacity={0.75}
              accessibilityRole="button"
              accessibilityLabel="Unpack A Trip"
            >
              <View style={[styles.plusMenuFeaturedIcon, { backgroundColor: COLORS.royalGold + '22' }]}>
                <Ionicons name="sparkles" size={20} color={COLORS.royalGold} />
              </View>
              <View style={[styles.plusMenuItemTextColumn, { gap: 3 }]}>
                <Text style={[styles.plusMenuItemLabel, { color: colors.textPrimary }]}>Unpack A Trip</Text>
                <Text style={[styles.plusMenuItemSubtitle, { color: colors.textSecondary }]}>
                  Turn memories into an organized story worth sharing
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
            </TouchableOpacity>
            </LinearGradient>
          </View>
        )}

        {/* Secondary priority — top priority while travel mode is active */}
        <View style={styles.plusMenuGridRow}>
          <TouchableOpacity
            style={[styles.plusMenuGridTile, { backgroundColor: colors.surfaceVariant }]}
            onPress={() => handlePlusMenuAction('Capture')}
            activeOpacity={0.75}
            accessibilityRole="button"
            accessibilityLabel="Live Capture"
          >
            <Ionicons name="camera-outline" size={22} color={colors.textPrimary} />
            <Text style={[styles.plusMenuGridLabel, { color: colors.textPrimary }]}>Live Capture</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.plusMenuGridTile, { backgroundColor: colors.surfaceVariant }]}
            onPress={() => handlePlusMenuAction('ImportLatest')}
            activeOpacity={0.75}
            accessibilityRole="button"
            accessibilityLabel="Import Memories"
          >
            <Ionicons name="sync-outline" size={22} color={colors.textPrimary} />
            <Text style={[styles.plusMenuGridLabel, { color: colors.textPrimary }]}>Import Memories</Text>
          </TouchableOpacity>
        </View>

        {/* Third priority */}
        <View style={styles.plusMenuGridRow}>
          <TouchableOpacity
            style={[styles.plusMenuGridTile, { backgroundColor: colors.surfaceVariant }]}
            onPress={() => handlePlusMenuAction('PostcardTemplates')}
            activeOpacity={0.75}
            accessibilityRole="button"
            accessibilityLabel="Create A Postcard"
          >
            <Ionicons name="image-outline" size={22} color={colors.textPrimary} />
            <Text style={[styles.plusMenuGridLabel, { color: colors.textPrimary }]}>Create A Postcard</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.plusMenuGridTile, { backgroundColor: colors.surfaceVariant }]}
            onPress={() => handlePlusMenuAction('NotesEditor')}
            activeOpacity={0.75}
            accessibilityRole="button"
            accessibilityLabel="Journal Entry"
          >
            <Ionicons name="pencil-outline" size={22} color={colors.textPrimary} />
            <Text style={[styles.plusMenuGridLabel, { color: colors.textPrimary }]}>Journal Entry</Text>
          </TouchableOpacity>
        </View>

        {/* Final priority — low-emphasis link row */}
        <TouchableOpacity
          style={styles.plusMenuMinorRow}
          onPress={() => handlePlusMenuAction('TripAlbumCreate')}
          activeOpacity={0.75}
          accessibilityRole="button"
          accessibilityLabel="New Trip Album"
        >
          <Ionicons name="book-outline" size={18} color={colors.textSecondary} />
          <Text style={[styles.plusMenuMinorLabel, { color: colors.textSecondary }]}>New Trip Album</Text>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
};

// Root Stack Navigator
// All navigators are lazy-loaded to prevent module-level initialization
export const AppNavigator: React.FC = () => {
  const { isLoading, hasCompletedOnboarding } = useAppContext();
  const { colors } = useTheme();

  // Lazy-load React Navigation modules only when component renders
  const NavigationContainer = require('@react-navigation/native').NavigationContainer;
  const createNativeStackNavigator = require('@react-navigation/native-stack').createNativeStackNavigator;

  // Lazy-load all screens only when component renders
  const CaptureScreen = useMemo(() => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return screenFromModule(require('../screens/CaptureScreen'), 'CaptureScreen');
  }, []);
  const CaptureSavedScreen = useMemo(() => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return screenFromModule(require('../screens/CaptureSavedScreen'), 'CaptureSavedScreen');
  }, []);
  const EntryDetailScreen = useMemo(() => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return screenFromModule(require('../screens/EntryDetailScreen'), 'EntryDetailScreen');
  }, []);
  const JournalDetailScreen = useMemo(() => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return screenFromModule(require('../screens/JournalDetailScreen'), 'JournalDetailScreen');
  }, []);
  const NotesEditorScreen = useMemo(() => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return screenFromModule(require('../screens/NotesEditorScreen'), 'NotesEditorScreen');
  }, []);
  const TripAlbumCreateScreen = useMemo(() => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return screenFromModule(require('../screens/TripAlbumCreateScreen'), 'TripAlbumCreateScreen');
  }, []);
  const TripAlbumDetailScreen = useMemo(() => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return screenFromModule(require('../screens/TripAlbumDetailScreen'), 'TripAlbumDetailScreen');
  }, []);
  const AddPastExperiencesScreen = useMemo(() => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return screenFromModule(require('../screens/AddPastExperiencesScreen'), 'AddPastExperiencesScreen');
  }, []);
  const ImportLatestScreen = useMemo(() => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return screenFromModule(require('../screens/ImportLatestScreen'), 'ImportLatestScreen');
  }, []);
  const EntryEditScreen = useMemo(() => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return screenFromModule(require('../screens/EntryEditScreen'), 'EntryEditScreen');
  }, []);
  const EmotionCaptureScreen = useMemo(() => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return screenFromModule(require('../screens/EmotionCaptureScreen'), 'EmotionCaptureScreen');
  }, []);
  const SettingsScreen = useMemo(() => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return screenFromModule(require('../screens/SettingsScreen'), 'SettingsScreen');
  }, []);
  const JourneyRecapCandidatesScreen = useMemo(() => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return screenFromModule(require('../screens/JourneyRecapCandidatesScreen'), 'JourneyRecapCandidatesScreen');
  }, []);
  const JourneyRecapPlayerScreen = useMemo(() => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return screenFromModule(require('../screens/JourneyRecapPlayerScreen'), 'JourneyRecapPlayerScreen');
  }, []);
  const JourneyRecapPostScreen = useMemo(() => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return screenFromModule(require('../screens/JourneyRecapPostScreen'), 'JourneyRecapPostScreen');
  }, []);
  const MemoriesSlideshowScreen = useMemo(() => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return screenFromModule(require('../screens/MemoriesSlideshowScreen'), 'MemoriesSlideshowScreen');
  }, []);
  const FullCountryCalendarScreen = useMemo(() => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return screenFromModule(require('../screens/FullCountryCalendarScreen'), 'FullCountryCalendarScreen');
  }, []);
  const DayDetailScreen = useMemo(() => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return screenFromModule(require('../screens/DayDetailScreen'), 'DayDetailScreen');
  }, []);
  const CountryRankingFullListScreen = useMemo(() => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return screenFromModule(require('../screens/CountryRankingFullListScreen'), 'CountryRankingFullListScreen');
  }, []);
  const CountriesVisitedMapScreen = useMemo(() => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return screenFromModule(require('../screens/CountriesVisitedMapScreen'), 'CountriesVisitedMapScreen');
  }, []);
  const PostcardTemplatesScreen = useMemo(() => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return screenFromModule(require('../screens/PostcardTemplatesScreen'), 'PostcardTemplates');
  }, []);
  const PostcardEditorScreen = useMemo(() => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return screenFromModule(require('../screens/PostcardEditorScreen'), 'PostcardEditor');
  }, []);
  const SavedPostcardsScreen = useMemo(() => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return screenFromModule(require('../screens/SavedPostcardsScreen'), 'SavedPostcards');
  }, []);
  const PostcardStoryEditorScreen = useMemo(() => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return screenFromModule(require('../screens/PostcardStoryEditorScreen'), 'PostcardStoryEditor');
  }, []);
  const SuggestedAlbumsScreen = useMemo(() => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return screenFromModule(require('../screens/SuggestedAlbumsScreen'), 'SuggestedAlbumsScreen');
  }, []);

  // Onboarding screens
  const OnboardingSlidesScreen = useMemo(() => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return screenFromModule(require('../screens/onboarding/OnboardingSlidesScreen'), 'OnboardingSlidesScreen');
  }, []);
  const OnboardingPathScreen = useMemo(() => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return screenFromModule(require('../screens/onboarding/OnboardingPathScreen'), 'OnboardingPathScreen');
  }, []);

  // Unpack A Trip screens
  const UnpackTripDetailsScreen = useMemo(() => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return screenFromModule(require('../screens/unpack/UnpackTripDetailsScreen'), 'UnpackTripDetailsScreen');
  }, []);
  const UnpackAddMemoriesScreen = useMemo(() => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return screenFromModule(require('../screens/unpack/UnpackAddMemoriesScreen'), 'UnpackAddMemoriesScreen');
  }, []);
  const UnpackProcessingScreen = useMemo(() => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return screenFromModule(require('../screens/unpack/UnpackProcessingScreen'), 'UnpackProcessingScreen');
  }, []);
  const UnpackHighlightScreen = useMemo(() => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return screenFromModule(require('../screens/unpack/UnpackHighlightScreen'), 'UnpackHighlightScreen');
  }, []);
  const UnpackUnpackingScreen = useMemo(() => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return screenFromModule(require('../screens/unpack/UnpackUnpackingScreen'), 'UnpackUnpackingScreen');
  }, []);

  // Create Stack navigator inside component to defer initialization
  const Stack = useMemo(() => createNativeStackNavigator() as StackNavigatorResult, []);

  // Get navigation ref to programmatically navigate
  const navigationRef = React.useRef<any>(null);

  // Hold on splash-matched background while app data initializes
  if (isLoading) {
    return <View style={{ flex: 1, backgroundColor: COLORS.splashBackground }} />;
  }

  return (
    <NavigationContainer ref={navigationRef}>
      <Stack.Navigator
        initialRouteName={hasCompletedOnboarding ? 'MainTabs' : 'OnboardingSlides'}
        screenOptions={{
          headerShown: false,
          gestureEnabled: true,
          animation: 'default',
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Screen
          name="OnboardingSlides"
          component={OnboardingSlidesScreen}
          options={{ headerShown: false, gestureEnabled: false, animation: 'fade' }}
        />
        <Stack.Screen
          name="OnboardingPath"
          component={OnboardingPathScreen}
          options={{ headerShown: false, gestureEnabled: false, animation: 'slide_from_right' }}
        />
        <Stack.Screen name="MainTabs" component={MainTabsWithVisibility} />
        <Stack.Screen
          name="Capture"
          component={CaptureScreen}
          options={{
            presentation: 'modal',
            gestureEnabled: false,
          }}
        />
        <Stack.Screen
          name="CaptureSaved"
          component={CaptureSavedScreen}
          options={{
            headerShown: false,
            presentation: 'card',
            animation: 'default',
            gestureEnabled: false,
          }}
        />
        <Stack.Screen
          name="EntryDetail"
          component={EntryDetailScreen}
          options={{
            headerShown: false,
            presentation: 'card',
            animation: 'default',
          }}
        />
        <Stack.Screen
          name="JournalDetail"
          component={JournalDetailScreen}
          options={{
            headerShown: false,
            presentation: 'card',
            animation: 'default',
          }}
        />
        <Stack.Screen
          name="NotesEditor"
          component={NotesEditorScreen}
          options={{
            headerShown: false,
            presentation: 'transparentModal',
            animation: 'none',
            cardStyle: { backgroundColor: 'transparent' },
          }}
        />
        <Stack.Screen
          name="TripAlbumCreate"
          component={TripAlbumCreateScreen}
          options={{
            headerShown: false,
            presentation: 'card',
            animation: 'default',
          }}
        />
        <Stack.Screen
          name="TripAlbumDetail"
          component={TripAlbumDetailScreen}
          options={{
            headerShown: false,
            presentation: 'card',
            animation: 'default',
          }}
        />
        <Stack.Screen
          name="TripAlbumEdit"
          component={TripAlbumCreateScreen}
          options={{
            headerShown: false,
            presentation: 'card',
            animation: 'default',
          }}
        />
        <Stack.Screen
          name="AddPastExperiences"
          component={AddPastExperiencesScreen}
          options={{
            headerShown: false,
            presentation: 'card',
            animation: 'default',
          }}
        />
        <Stack.Screen
          name="ImportLatest"
          component={ImportLatestScreen}
          options={{
            headerShown: false,
            presentation: 'card',
            animation: 'default',
          }}
        />
        <Stack.Screen
          name="EntryEdit"
          component={EntryEditScreen}
          options={{
            headerShown: false,
            presentation: 'card',
            animation: 'default',
          }}
        />
        <Stack.Screen
          name="EmotionCapture"
          component={EmotionCaptureScreen}
          options={{
            headerShown: false,
            presentation: 'modal',
          }}
        />
        <Stack.Screen
          name="Settings"
          component={SettingsScreen}
          options={{
            headerShown: false,
            presentation: 'card',
            animation: 'default',
          }}
        />
        <Stack.Screen
          name="JourneyRecapCandidates"
          component={JourneyRecapCandidatesScreen}
          options={{
            headerShown: false,
            presentation: 'card',
            animation: 'default',
          }}
        />
        <Stack.Screen
          name="JourneyRecapPlayer"
          component={JourneyRecapPlayerScreen}
          options={{
            headerShown: false,
            presentation: 'card',
            animation: 'default',
          }}
        />
        <Stack.Screen
          name="JourneyRecapPost"
          component={JourneyRecapPostScreen}
          options={{
            headerShown: false,
            presentation: 'card',
            animation: 'default',
          }}
        />
        <Stack.Screen
          name="MemoriesSlideshow"
          component={MemoriesSlideshowScreen}
          options={{
            headerShown: false,
            presentation: 'card',
            animation: 'default',
          }}
        />
        <Stack.Screen
          name="FullCountryCalendar"
          component={FullCountryCalendarScreen}
          options={{
            headerShown: false,
            presentation: 'card',
            animation: 'default',
          }}
        />
        <Stack.Screen
          name="DayDetail"
          component={DayDetailScreen}
          options={{
            headerShown: false,
            presentation: 'modal',
            animation: 'default',
          }}
        />
        <Stack.Screen
          name="CountryRankingFullList"
          component={CountryRankingFullListScreen}
          options={{
            headerShown: false,
            presentation: 'card',
            animation: 'default',
          }}
        />
        <Stack.Screen
          name="CountriesVisitedMapFull"
          component={CountriesVisitedMapScreen}
          options={{
            headerShown: false,
            presentation: 'card',
            animation: 'default',
          }}
        />
        <Stack.Screen
          name="PostcardTemplates"
          component={PostcardTemplatesScreen}
          options={{
            headerShown: false,
            presentation: 'card',
            animation: 'default',
          }}
        />
        <Stack.Screen
          name="PostcardEditor"
          component={PostcardEditorScreen}
          options={{
            headerShown: false,
            presentation: 'card',
            animation: 'default',
          }}
        />
        <Stack.Screen
          name="SavedPostcards"
          component={SavedPostcardsScreen}
          options={{
            headerShown: false,
            presentation: 'card',
            animation: 'default',
          }}
        />
        <Stack.Screen
          name="PostcardStoryEditor"
          component={PostcardStoryEditorScreen}
          options={{
            headerShown: false,
            presentation: 'card',
            animation: 'default',
          }}
        />
        <Stack.Screen
          name="SuggestedAlbums"
          component={SuggestedAlbumsScreen}
          options={{
            headerShown: false,
            presentation: 'card',
            animation: 'default',
          }}
        />
        {/* Unpack A Trip screens */}
        <Stack.Screen
          name="UnpackTripDetails"
          component={UnpackTripDetailsScreen}
          options={{ headerShown: false, presentation: 'card', animation: 'default' }}
        />
        <Stack.Screen
          name="UnpackAddMemories"
          component={UnpackAddMemoriesScreen}
          options={{ headerShown: false, presentation: 'card', animation: 'default' }}
        />
        <Stack.Screen
          name="UnpackProcessing"
          component={UnpackProcessingScreen}
          options={{ headerShown: false, animation: 'none', gestureEnabled: false }}
        />
        <Stack.Screen
          name="UnpackHighlight"
          component={UnpackHighlightScreen}
          options={{ headerShown: false, presentation: 'card', animation: 'default' }}
        />
        <Stack.Screen
          name="UnpackUnpacking"
          component={UnpackUnpackingScreen}
          options={{ headerShown: false, presentation: 'card', animation: 'default' }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
};

const MainTabsWithVisibility: React.FC = () => (
  <MainTabBarVisibilityProvider>
    <MainTabs />
  </MainTabBarVisibilityProvider>
);

// Styles for tab bar and invisible spacer box
const styles = StyleSheet.create({
  tabBarOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 2000,
    borderTopWidth: 1,
  },
  tabBarContainer: {
    flexDirection: 'row',
    height: DIMENSIONS.bottomNavHeight,
    paddingHorizontal: 0, // Reduced spacing: 25% less padding
  },
  tabButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 8,
    paddingHorizontal: 0, // Reduced spacing: 25% less padding
  },
  tabLabelContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  tabLabel: {
    fontFamily: TEXT_STYLES.navTab.fontFamily,
    fontSize: (TEXT_STYLES.navTab.fontSize ?? 24) * 0.75 * 1.15, // 21px
    fontWeight: '600' as const,
    marginTop: -8,
  },
  activeIndicator: {
    position: 'absolute',
    bottom: -12, // Moved up closer to text (was at bottom: 0)
    alignSelf: 'center',
    height: 2,
    borderRadius: 1,
    overflow: 'hidden',
  },
  activeIndicatorFillWrapper: {
    height: 2,
    borderRadius: 1,
    overflow: 'hidden',
  },
  activeIndicatorGradient: {
    width: '100%',
    height: '100%',
  },
  plusButtonWrapper: {
    alignSelf: 'center',
  },
  plusButtonGradientBorder: {
    width: 76,
    height: 50,
    borderRadius: 25,
    padding: 2,
  },
  plusButtonInner: {
    flex: 1,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
  },
  plusMenuContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingBottom: SPACING.md,
    overflow: 'hidden',
  },
  plusMenuHandleArea: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  plusMenuHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
  },
  plusMenuItemTextColumn: {
    flex: 1,
    gap: 2,
  },
  plusMenuItemLabel: {
    fontFamily: FONTS.inter,
    fontSize: 16,
    fontWeight: FONT_WEIGHTS.semibold as any,
  },
  plusMenuItemSubtitle: {
    fontFamily: FONTS.inter,
    fontSize: 13,
    fontWeight: FONT_WEIGHTS.regular as any,
  },
  plusMenuGridRow: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: SPACING.lg,
    marginBottom: 12,
  },
  plusMenuGridTile: {
    flex: 1,
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 14,
    gap: 10,
  },
  plusMenuGridLabel: {
    fontFamily: FONTS.inter,
    fontSize: 14,
    fontWeight: FONT_WEIGHTS.semibold as any,
  },
  plusMenuMinorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
  },
  plusMenuMinorLabel: {
    fontFamily: FONTS.inter,
    fontSize: 14,
    fontWeight: FONT_WEIGHTS.regular as any,
  },
  plusMenuFeaturedSection: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.xs,
    paddingBottom: SPACING.sm,
  },
  plusMenuFeaturedGradientBorder: {
    borderRadius: 16,
    padding: 1.5,
  },
  plusMenuFeaturedCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderRadius: 14,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
  },
  plusMenuFeaturedIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
