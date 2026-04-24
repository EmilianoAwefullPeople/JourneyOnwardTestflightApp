// ReviewScreen
// Review screen sections: Dashboard, Trip Albums, Gallery

import React, { useState, useRef, useEffect, useMemo } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList, MainTabParamList, ReviewSectionParam } from '../navigation/types';
import { SPACING, FONT_WEIGHTS } from '../config/constants';
import { TEXT_STYLES } from '../config/typography';
import { useAppContext } from '../context/AppContext';
import { useProgress } from '../context/ProgressContext';
import { useTheme } from '../context/ThemeContext';
import { MeshGradientBackground } from '../components/common/MeshGradientBackground';
import SegmentControl, { ReviewSection } from '../components/review/SegmentControl';
import { useMainTabBarVisibility } from '../navigation/mainTabBarVisibility';

const VALID_REVIEW_SECTIONS: ReviewSection[] = ['stats', 'tripAlbums', 'bookmarks'];

function normalizeSection(value: ReviewSectionParam | undefined): ReviewSection {
  return (VALID_REVIEW_SECTIONS as string[]).includes(value as string) ? (value as ReviewSection) : 'stats';
}
import BookmarksSection from '../components/review/BookmarksSection';
import TripAlbumsSection from '../components/review/TripAlbumsSection';
import DashboardSection from '../components/review/DashboardSection';
import { Entry } from '../models/Entry';
import { Journal } from '../models/Journal';
import { TripAlbum } from '../models/TripAlbum';

type ReviewScreenNavigationProp = NativeStackNavigationProp<RootStackParamList>;

const ReviewScreen: React.FC = () => {
  const navigation = useNavigation<ReviewScreenNavigationProp>();
  const route = useRoute<RouteProp<MainTabParamList, 'Review'>>();
  const insets = useSafeAreaInsets();
  const { entries, journals, tripAlbums, travelModeEnabled, activeTripAlbums } = useAppContext();
  const { recordReviewSection } = useProgress();
  const { colors, isDark } = useTheme();
  const { visibilityProgress, reportScrollOffset } = useMainTabBarVisibility();
  const [activeSection, setActiveSection] = useState<ReviewSection>(
    () => normalizeSection(route.params?.initialSection)
  );
  const normalizedSection = normalizeSection(activeSection);
  const activeSectionRef = useRef<ReviewSection>(normalizedSection);
  const bookmarksScrollRef = useRef<ScrollView | null>(null);
  const tripAlbumsScrollRef = useRef<ScrollView | null>(null);
  const statsScrollRef = useRef<ScrollView | null>(null);

  // Travel Mode trip filter — active by default when travel mode is on with active albums
  const tripFilterAvailable = travelModeEnabled && activeTripAlbums.length > 0;
  const [tripFilterActive, setTripFilterActive] = useState(() => tripFilterAvailable);
  // Sync when travel mode state changes externally (e.g. toggled in Settings)
  useEffect(() => {
    setTripFilterActive(tripFilterAvailable);
  }, [tripFilterAvailable]);

  const activeAlbumIds = useMemo(
    () => new Set(activeTripAlbums.map(a => a.id)),
    [activeTripAlbums]
  );

  const displayEntries = useMemo(() => {
    if (!tripFilterActive || activeTripAlbums.length === 0) return entries ?? [];
    return (entries ?? []).filter(e => e.albumId && activeAlbumIds.has(e.albumId));
  }, [entries, tripFilterActive, activeTripAlbums, activeAlbumIds]);

  const displayJournals = useMemo(() => {
    if (!tripFilterActive || activeTripAlbums.length === 0) return journals ?? [];
    return (journals ?? []).filter(j => j.albumId && activeAlbumIds.has(j.albumId));
  }, [journals, tripFilterActive, activeTripAlbums, activeAlbumIds]);

  useEffect(() => {
    activeSectionRef.current = normalizedSection;
  }, [normalizedSection]);

  useEffect(() => {
    const unsubscribe = (navigation as any).addListener?.('tabPress', () => {
      try {
        const active = activeSectionRef.current;
        const activeScrollRef =
          active === 'bookmarks'
            ? bookmarksScrollRef
            : active === 'tripAlbums'
              ? tripAlbumsScrollRef
              : statsScrollRef;
        activeScrollRef.current?.scrollTo({ y: 0, x: 0, animated: true });
      } catch (_) {
        // ignore if ref not attached
      }
    });
    return typeof unsubscribe === 'function' ? unsubscribe : undefined;
  }, [navigation]);

  useEffect(() => {
    try {
      recordReviewSection(normalizedSection);
    } catch (_) {
      // Non-blocking
    }
  }, [normalizedSection, recordReviewSection]);

  // Navigation handlers
  const handleEntryPress = (entry: Entry) => {
    navigation.navigate('EntryDetail', { entryId: entry.id });
  };
  
  const handleJournalPress = (journal: Journal) => {
    navigation.navigate('JournalDetail', { journalId: journal.id });
  };
  
  const handleAlbumPress = (album: TripAlbum) => {
    navigation.navigate('TripAlbumDetail', { albumId: album.id });
  };

  const handleCreateAlbumPress = () => {
    navigation.navigate('TripAlbumCreate');
  };
  
  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <MeshGradientBackground baseColor={colors.background} lightMode={!isDark} />
      
      {/* Segment Control */}
      <View style={[styles.segmentContainer, { paddingTop: insets.top + 20, paddingBottom: SPACING.sm }]}>
        <SegmentControl
          activeSegment={normalizedSection}
          onSegmentChange={setActiveSection}
        />
        {/* Gallery (bookmarks) tucks "This Trip" into the All | Bookmarks row */}
        {travelModeEnabled && normalizedSection !== 'bookmarks' && (
          <View style={styles.tripFilterRow}>
            <TouchableOpacity
              style={[styles.tripFilterButton, { backgroundColor: colors.surface }, !tripFilterActive && { opacity: 0.5 }]}
              onPress={() => setTripFilterActive(v => !v)}
              accessibilityRole="button"
              accessibilityLabel={tripFilterActive ? 'Trip filter on, tap to show all' : 'Trip filter off, tap to filter by trip'}
              accessibilityState={{ selected: tripFilterActive }}
            >
              <Text style={[styles.tripFilterButtonText, { color: colors.textPrimary }]}>
                {tripFilterActive ? 'This Trip ✓' : 'This Trip'}
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      <View style={styles.contentContainer}>
        <View
          style={[styles.sectionPanel, { display: normalizedSection === 'bookmarks' ? 'flex' : 'none' }]}
          accessibilityElementsHidden={normalizedSection !== 'bookmarks'}
          importantForAccessibility={normalizedSection === 'bookmarks' ? 'auto' : 'no-hide-descendants'}
        >
          <BookmarksSection
            entries={displayEntries}
            onEntryPress={handleEntryPress}
            scrollRef={bookmarksScrollRef}
            onScrollReport={reportScrollOffset}
            tabBarVisibilityProgress={visibilityProgress}
            tripFilterAvailable={tripFilterAvailable}
            tripFilterActive={tripFilterActive}
            onTripFilterToggle={() => setTripFilterActive((v) => !v)}
          />
        </View>
        <View
          style={[styles.sectionPanel, { display: normalizedSection === 'tripAlbums' ? 'flex' : 'none' }]}
          accessibilityElementsHidden={normalizedSection !== 'tripAlbums'}
          importantForAccessibility={normalizedSection === 'tripAlbums' ? 'auto' : 'no-hide-descendants'}
        >
          <TripAlbumsSection
            tripAlbums={tripAlbums}
            entries={displayEntries}
            journals={displayJournals}
            onAlbumPress={handleAlbumPress}
            onCreateAlbumPress={handleCreateAlbumPress}
            scrollRef={tripAlbumsScrollRef}
            onScrollReport={reportScrollOffset}
            tabBarVisibilityProgress={visibilityProgress}
          />
        </View>
        <View
          style={[styles.sectionPanel, { display: normalizedSection === 'stats' ? 'flex' : 'none' }]}
          accessibilityElementsHidden={normalizedSection !== 'stats'}
          importantForAccessibility={normalizedSection === 'stats' ? 'auto' : 'no-hide-descendants'}
        >
          <DashboardSection
            entries={displayEntries}
            journals={displayJournals}
            tripAlbums={tripAlbums}
            tripFilterActive={tripFilterActive && activeTripAlbums.length > 0}
            scrollRef={statsScrollRef}
            onScrollReport={reportScrollOffset}
            tabBarVisibilityProgress={visibilityProgress}
          />
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  segmentContainer: {
    paddingTop: 50,
    paddingBottom: SPACING.sm,
    backgroundColor: 'transparent',
  },
  contentContainer: {
    flex: 1,
  },
  sectionPanel: {
    flex: 1,
  },
  tripFilterRow: {
    flexDirection: 'row',
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.xs,
    paddingBottom: SPACING.xs,
  },
  tripFilterButton: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: 20,
  },
  tripFilterButtonText: {
    ...TEXT_STYLES.entryInput,
    fontSize: 14,
    fontWeight: FONT_WEIGHTS.semibold,
  },
});

export default ReviewScreen;
