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
import { useTheme } from '../context/ThemeContext';
import { MeshGradientBackground } from '../components/common/MeshGradientBackground';
import SegmentControl, { ReviewSection } from '../components/review/SegmentControl';
import { useMainTabBarVisibility } from '../navigation/mainTabBarVisibility';
import { Ionicons } from '@expo/vector-icons';

const VALID_REVIEW_SECTIONS: ReviewSection[] = ['stats', 'tripAlbums', 'bookmarks'];

function normalizeSection(value: ReviewSectionParam | undefined): ReviewSection {
  return (VALID_REVIEW_SECTIONS as string[]).includes(value as string) ? (value as ReviewSection) : 'stats';
}
import BookmarksSection from '../components/review/BookmarksSection';
import TripAlbumsSection from '../components/review/TripAlbumsSection';
import DashboardSection from '../components/review/DashboardSection';
import { Entry } from '../models/Entry';
import { Journal } from '../models/Journal';
import { Postcard } from '../models/Postcard';
import { TripAlbum } from '../models/TripAlbum';

type ReviewScreenNavigationProp = NativeStackNavigationProp<RootStackParamList>;

const ReviewScreen: React.FC = () => {
  const navigation = useNavigation<ReviewScreenNavigationProp>();
  const route = useRoute<RouteProp<MainTabParamList, 'Review'>>();
  const insets = useSafeAreaInsets();
  const { entries, journals, tripAlbums, travelModeEnabled, activeTripAlbums, postcards } = useAppContext();
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

  // Navigation handlers
  const handleEntryPress = (entry: Entry) => {
    navigation.navigate('EntryDetail', { entryId: entry.id });
  };
  
  const handleJournalPress = (journal: Journal) => {
    navigation.navigate('JournalDetail', { journalId: journal.id });
  };

  const handlePostcardPress = (postcard: Postcard) => {
    navigation.navigate('PostcardEditor', { postcardId: postcard.id });
  };
  
  const handleAlbumPress = (album: TripAlbum) => {
    navigation.navigate('TripAlbumDetail', { albumId: album.id });
  };

  const handleCreateAlbumPress = () => {
    navigation.navigate('TripAlbumCreate');
  };

  const handleSuggestTripsPress = () => {
    navigation.navigate('SuggestedAlbums');
  };

  const handleRecapPress = (album: TripAlbum) => {
    navigation.navigate('JourneyRecapPlayer', { albumId: album.id });
  };

  const handleSlideshowPress = (album: TripAlbum) => {
    navigation.navigate('MemoriesSlideshow', { albumId: album.id });
  };
  
  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <MeshGradientBackground baseColor={colors.background} lightMode={!isDark} />
      
      {/* Segment Control */}
      <View style={[styles.segmentContainer, { paddingTop: insets.top + 12, paddingBottom: SPACING.sm }]}>
        <View style={styles.settingsRow}>
          <TouchableOpacity
            style={[styles.settingsButton, { backgroundColor: colors.surfaceVariant, borderColor: colors.border }]}
            onPress={() => navigation.navigate('Settings')}
            accessibilityRole="button"
            accessibilityLabel="Settings"
          >
            <Ionicons name="settings-outline" size={22} color={colors.textPrimary} />
          </TouchableOpacity>
        </View>
        <View style={styles.segmentRow}>
          <SegmentControl
            activeSegment={normalizedSection}
            onSegmentChange={setActiveSection}
          />
        </View>
        {/* "This Trip" is hidden on Your Trips (always show all albums) and on Gallery (tucked into the filter row) */}
        {travelModeEnabled && normalizedSection === 'stats' && (
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
        {/*
          Gallery sits in absoluteFillObject so FlashList always has valid container
          dimensions — no remeasure delay when switching to this tab. It is physically
          covered by the Stats/TripAlbums panels when those are active (they carry an
          opaque background), so no opacity toggle is needed and no slide occurs.
        */}
        <View
          style={StyleSheet.absoluteFillObject}
          pointerEvents={normalizedSection === 'bookmarks' ? 'auto' : 'none'}
          accessibilityElementsHidden={normalizedSection !== 'bookmarks'}
          importantForAccessibility={normalizedSection === 'bookmarks' ? 'auto' : 'no-hide-descendants'}
        >
          <BookmarksSection
            entries={displayEntries}
            journals={displayJournals}
            postcards={postcards}
            onEntryPress={handleEntryPress}
            onJournalPress={handleJournalPress}
            onPostcardPress={handlePostcardPress}
            scrollRef={bookmarksScrollRef}
            onScrollReport={reportScrollOffset}
            tabBarVisibilityProgress={visibilityProgress}
            tripFilterAvailable={tripFilterAvailable}
            tripFilterActive={tripFilterActive}
            onTripFilterToggle={() => setTripFilterActive((v) => !v)}
          />
        </View>
        {/*
          Stats and TripAlbums use display:none when inactive (renders fresh, no slide).
          backgroundColor covers the Gallery panel sitting beneath them.
        */}
        <View style={[styles.sectionPanel, { display: normalizedSection === 'tripAlbums' ? 'flex' : 'none', backgroundColor: colors.background }]}>
          <TripAlbumsSection
            tripAlbums={tripAlbums}
            activeTripAlbums={activeTripAlbums}
            entries={entries ?? []}
            journals={journals ?? []}
            onAlbumPress={handleAlbumPress}
            onCreateAlbumPress={handleCreateAlbumPress}
            onSuggestTripsPress={handleSuggestTripsPress}
            onRecapPress={handleRecapPress}
            onSlideshowPress={handleSlideshowPress}
            scrollRef={tripAlbumsScrollRef}
            onScrollReport={reportScrollOffset}
            tabBarVisibilityProgress={visibilityProgress}
          />
        </View>
        <View style={[styles.sectionPanel, { display: normalizedSection === 'stats' ? 'flex' : 'none', backgroundColor: colors.background }]}>
          <DashboardSection
            entries={displayEntries}
            journals={displayJournals}
            tripAlbums={tripAlbums}
            tripFilterActive={tripFilterActive && activeTripAlbums.length > 0}
            isVisible={normalizedSection === 'stats'}
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
  settingsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: SPACING.md,
    marginBottom: SPACING.xs,
  },
  segmentRow: {
    paddingHorizontal: SPACING.md,
  },
  settingsButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
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
