// App Navigator
// Main navigation structure with deferred initialization to prevent boolean/string errors

import React, { useMemo, useEffect, useRef } from 'react';
import { View, StyleSheet, Text, TouchableOpacity, Animated, Easing } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';

// DO NOT import React Navigation modules at top level - they trigger native module registration
// DO NOT import screen components at top level - lazy-load them instead

import { RootStackParamList, MainTabParamList } from './types';
import { COLORS, DIMENSIONS } from '../config/constants';
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

// Main Tab Navigator - Lazy loaded to avoid initialization at module import time
const MainTabs = () => {
  // Lazy-load createBottomTabNavigator only when component renders
  const createBottomTabNavigator = require('@react-navigation/bottom-tabs').createBottomTabNavigator;

  // State to store text widths for active indicator
  const [textWidths, setTextWidths] = React.useState<{ [key: string]: number }>({});

  // Keep Studio as a deferred module load so startup is not blocked by Studio imports.
  const HomeScreen = require('../screens/HomeScreen').default;
  const ReviewScreen = require('../screens/ReviewScreen').default;

  // Create Tab navigator inside component to defer initialization
  const Tab = useMemo(() => createBottomTabNavigator() as TabNavigatorResult, []);

  // Get safe area insets for proper home indicator spacing
  const insets = useSafeAreaInsets();

  const { colors } = useTheme();
  const { hidden, visibilityProgress, setActiveRouteKey } = useMainTabBarVisibilityController();
  const tabBarTranslateY = useRef(new Animated.Value(0)).current;

  const stateRef = useRef<any>(null);
    const tabBarHeight = DIMENSIONS.bottomNavHeight + Math.max(insets.bottom, MAIN_TAB_BAR_HOME_INDICATOR_MIN);

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
              <TouchableOpacity
                key={route.key}
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
                      { color: isFocused ? colors.textPrimary : colors.textSecondary },
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
                  {isFocused && (
                    <ActiveIndicator width={textWidths[route.key] ?? 55} />
                  )}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      </Animated.View>
    );
  };

  return (
    <Tab.Navigator
      initialRouteName="Home"
      screenOptions={{
        headerShown: false,
        tabBarStyle: { display: 'none' }, // Hide default tab bar since we use custom
        lazy: true, // Enable lazy mounting - screens load only when first accessed
        unmountOnBlur: false, // Keep screens mounted after first visit for instant return
      }}
      tabBar={CustomTabBar}
    >
      <Tab.Screen
        name="Studio"
        getComponent={() => require('../screens/CreateScreen').default}
        options={{
          tabBarLabel: 'Studio',
          tabBarAccessibilityLabel: 'Studio tab',
        }}
      />
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
  );
};

// Root Stack Navigator
// All navigators are lazy-loaded to prevent module-level initialization
export const AppNavigator: React.FC = () => {
  const { isLoading, isFirstLaunch } = useAppContext();
  const { colors } = useTheme();

  // Lazy-load React Navigation modules only when component renders
  const NavigationContainer = require('@react-navigation/native').NavigationContainer;
  const createNativeStackNavigator = require('@react-navigation/native-stack').createNativeStackNavigator;

  // Lazy-load all screens only when component renders
  const LoadingScreen = useMemo(() => require('../screens/LoadingScreen').default, []);
  const WelcomeScreen = useMemo(() => require('../screens/WelcomeScreen').default, []);
  const CaptureScreen = useMemo(() => require('../screens/CaptureScreen').default, []);
  const EntryDetailScreen = useMemo(() => require('../screens/EntryDetailScreen').default, []);
  const JournalDetailScreen = useMemo(() => require('../screens/JournalDetailScreen').default, []);
  const NotesEditorScreen = useMemo(() => require('../screens/NotesEditorScreen').default, []);
  const TripAlbumCreateScreen = useMemo(() => require('../screens/TripAlbumCreateScreen').default, []);
  const TripAlbumDetailScreen = useMemo(() => require('../screens/TripAlbumDetailScreen').default, []);
  const AddPastExperiencesScreen = useMemo(() => require('../screens/AddPastExperiencesScreen').default, []);
  const ImportLatestScreen = useMemo(() => require('../screens/ImportLatestScreen').default, []);
  const EntryEditScreen = useMemo(() => require('../screens/EntryEditScreen').default, []);
  const EmotionCaptureScreen = useMemo(() => require('../screens/EmotionCaptureScreen').default, []);
  const SettingsScreen = useMemo(() => require('../screens/SettingsScreen').default, []);
  const JourneyRecapCandidatesScreen = useMemo(() => require('../screens/JourneyRecapCandidatesScreen').default, []);
  const JourneyRecapPlayerScreen = useMemo(() => require('../screens/JourneyRecapPlayerScreen').default, []);
  const JourneyRecapPostScreen = useMemo(() => require('../screens/JourneyRecapPostScreen').default, []);
  const FullCountryCalendarScreen = useMemo(() => require('../screens/FullCountryCalendarScreen').default, []);
  const CountryRankingFullListScreen = useMemo(() => require('../screens/CountryRankingFullListScreen').default, []);

  // Create Stack navigator inside component to defer initialization
  const Stack = useMemo(() => createNativeStackNavigator() as StackNavigatorResult, []);

  // Get navigation ref to programmatically navigate
  const navigationRef = React.useRef<any>(null);

  // Show loading screen while app initializes
  if (isLoading) {
    return (
      <NavigationContainer ref={navigationRef}>
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          <Stack.Screen name="Loading" component={LoadingScreen} />
        </Stack.Navigator>
      </NavigationContainer>
    );
  }

  // Determine initial route based on first launch
  const initialRouteName = isFirstLaunch ? 'Welcome' : 'MainTabs';

  return (
    <NavigationContainer ref={navigationRef}>
      <Stack.Navigator
        initialRouteName={initialRouteName}
        screenOptions={{
          headerShown: false,
          gestureEnabled: true,
          animation: 'default',
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Screen name="Loading" component={LoadingScreen} />
        <Stack.Screen name="Welcome" component={WelcomeScreen} />
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
          name="FullCountryCalendar"
          component={FullCountryCalendarScreen}
          options={{
            headerShown: false,
            presentation: 'card',
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
});
