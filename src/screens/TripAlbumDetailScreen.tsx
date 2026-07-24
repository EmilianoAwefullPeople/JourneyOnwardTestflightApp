// TripAlbumDetailScreen
// Detail screen for a specific trip album with All Memories, Dashboard, and Map sub-sections

import React, { useState, useMemo, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Animated, Easing, Alert, TouchableWithoutFeedback, useWindowDimensions } from 'react-native';
import { useReduceMotion } from '../hooks/useReduceMotion';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { useAppContext } from '../context/AppContext';
import { SPACING, FONTS, FONT_WEIGHTS } from '../config/constants';
import { TEXT_STYLES } from '../config/typography';
import { useTheme } from '../context/ThemeContext';
import { TripAlbum } from '../models/TripAlbum';
import BackArrow from '../components/common/icons/BackArrow';
import { MeshGradientBackground } from '../components/common/MeshGradientBackground';
import TripAlbumSegmentControl from '../components/review/TripAlbumSegmentControl';
import BookmarksSection from '../components/review/BookmarksSection';
import MapViewSection from '../components/review/MapViewSection';
import DashboardSection from '../components/review/DashboardSection';
import { isTripFinished } from '../utils/albumUtils';
import { Ionicons } from '@expo/vector-icons';

type TripAlbumDetailScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, 'TripAlbumDetail'>;
type TripAlbumDetailScreenRouteProp = RouteProp<RootStackParamList, 'TripAlbumDetail'>;

const TripAlbumDetailScreen: React.FC = () => {
  const navigation = useNavigation<TripAlbumDetailScreenNavigationProp>();
  const route = useRoute<TripAlbumDetailScreenRouteProp>();
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const { albumId } = route.params;
  const { tripAlbums, entries, journals, deleteTripAlbum } = useAppContext();

  const [activeSection, setActiveSection] = useState<'all' | 'dashboard' | 'map'>('all');
  const [menuVisible, setMenuVisible] = useState(false);
  const [menuExiting, setMenuExiting] = useState(false);
  const menuOverlayOpacity = useRef(new Animated.Value(0)).current;
  const menuDropdownScale = useRef(new Animated.Value(0.92)).current;
  const allScrollRef = useRef<ScrollView | null>(null);
  const dashboardScrollRef = useRef<ScrollView | null>(null);
  const mapScrollRef = useRef<ScrollView | null>(null);
  const activeSectionRef = useRef<'all' | 'dashboard' | 'map'>('all');
  const reduceMotion = useReduceMotion();
  const sectionOpacity = useRef(new Animated.Value(1)).current;
  const sectionTranslateY = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    activeSectionRef.current = activeSection;
  }, [activeSection]);

  // Responsive dimensions (safe area so header clears notch)
  const { width: screenWidth } = useWindowDimensions();
  const scaleFactor = screenWidth / 390;
  const topBarTop = insets.top + (107.07 - 74 + 20) * scaleFactor;

  // Find album
  const album = useMemo(() => {
    return tripAlbums.find(a => a.id === albumId);
  }, [tripAlbums, albumId]);

  // Recap summarizes a finished trip — not offered until the trip is over.
  const tripFinished = useMemo(() => (album ? isTripFinished(album) : false), [album]);

  // Filter entries and journals for this album
  const albumEntries = useMemo(() => {
    return entries.filter(e => e.albumId === albumId);
  }, [entries, albumId]);

  const albumJournals = useMemo(() => {
    return journals.filter(j => j.albumId === albumId);
  }, [journals, albumId]);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: { flex: 1, backgroundColor: colors.background },
        header: {
          paddingTop: 50,
          paddingHorizontal: SPACING.md,
          paddingBottom: SPACING.sm,
          flexDirection: 'row',
          alignItems: 'flex-start',
          position: 'relative',
        },
        backButton: { marginRight: SPACING.md, marginTop: 4 },
        menuButton: {
          position: 'absolute',
          top: 50,
          right: SPACING.md,
          paddingVertical: SPACING.xs,
          paddingHorizontal: SPACING.sm,
          zIndex: 100,
        },
        menuButtonText: {
          fontFamily: FONTS.inter,
          fontSize: 24,
          fontWeight: FONT_WEIGHTS.bold,
          color: colors.textPrimary,
          lineHeight: 24,
        },
        menuOverlay: { ...StyleSheet.absoluteFillObject, zIndex: 200, backgroundColor: 'rgba(0,0,0,0.3)' },
        menuDropdown: {
          position: 'absolute',
          top: 100,
          right: SPACING.md,
          backgroundColor: colors.surface,
          borderRadius: 8,
          minWidth: 120,
          paddingVertical: 4,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.3,
          shadowRadius: 4,
          elevation: 8,
        },
        menuOption: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 16, gap: 10 },
        menuOptionText: { fontFamily: FONTS.inter, fontSize: 16, color: colors.textPrimary },
        menuOptionTextDanger: { color: '#DC2626' },
        headerContent: { flex: 1 },
        segmentContainer: { paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm },
        segmentButtons: { flexDirection: 'row', alignItems: 'center', width: '100%' },
        segmentButton: {
          flex: 1,
          minWidth: 0,
          paddingHorizontal: SPACING.xs,
          paddingVertical: SPACING.sm,
          alignItems: 'center',
          justifyContent: 'center',
          borderBottomWidth: 2,
          borderBottomColor: 'transparent',
        },
        segmentButtonActive: { borderBottomColor: colors.textPrimary },
        segmentText: { ...TEXT_STYLES.entryInput, fontSize: 12, color: colors.infoTextGray },
        segmentTextActive: { fontWeight: '600', color: colors.textPrimary },
        albumName: { ...TEXT_STYLES.headerGreeting, fontSize: 24, marginBottom: SPACING.xs, color: colors.textPrimary },
        albumLocation: { ...TEXT_STYLES.entryInput, fontSize: 15, color: colors.textSecondary, marginBottom: SPACING.xs },
        albumDate: { ...TEXT_STYLES.entryInput, fontSize: 14, color: colors.textSecondary },
        content: { flex: 1 },
        errorContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: SPACING.xxl },
        errorText: { ...TEXT_STYLES.entryInput, fontSize: 20, marginBottom: SPACING.sm, color: colors.textPrimary },
        errorSubtext: { ...TEXT_STYLES.placeholderText, textAlign: 'center', color: colors.textSecondary },
        emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: SPACING.xxl },
        emptyStateText: { ...TEXT_STYLES.entryInput, fontSize: 18, marginBottom: SPACING.sm, color: colors.textPrimary },
        emptyStateSubtext: { ...TEXT_STYLES.placeholderText, textAlign: 'center', color: colors.textSecondary },
        sectionPanel: { flex: 1 },
      }),
    [colors]
  );

  // Navigation handlers
  const handleBack = () => {
    navigation.goBack();
  };

  const handleEntryPress = (entry: any) => {
    navigation.navigate('EntryDetail', { entryId: entry.id });
  };

  const handleJournalPress = (journal: any) => {
    navigation.navigate('JournalDetail', { journalId: journal.id });
  };

  const handleRecapPress = () => {
    navigation.navigate('JourneyRecapPlayer', { albumId });
  };

  const scrollActiveSectionToTop = () => {
    const section = activeSectionRef.current;
    const targetRef =
      section === 'all'
        ? allScrollRef
        : section === 'dashboard'
          ? dashboardScrollRef
          : mapScrollRef;
    targetRef.current?.scrollTo?.({ y: 0, x: 0, animated: true });
  };

  // Menu open/close animations
  useEffect(() => {
    if (menuVisible && !menuExiting) {
      menuOverlayOpacity.setValue(0);
      menuDropdownScale.setValue(0.92);
      Animated.parallel([
        Animated.timing(menuOverlayOpacity, {
          toValue: 1,
          duration: 200,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(menuDropdownScale, {
          toValue: 1,
          duration: 220,
          easing: Easing.bezier(0.16, 1, 0.3, 1),
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [menuVisible, menuExiting]);

  // Section transition animation (respect reduce motion)
  const durationOut = reduceMotion ? 0 : 150;
  const durationIn = reduceMotion ? 0 : 200;
  useEffect(() => {
    if (reduceMotion) {
      sectionOpacity.setValue(1);
      sectionTranslateY.setValue(0);
      return;
    }
    sectionOpacity.setValue(0);
    sectionTranslateY.setValue(-10);
    Animated.parallel([
      Animated.timing(sectionOpacity, {
        toValue: 1,
        duration: durationIn,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(sectionTranslateY, {
        toValue: 0,
        duration: durationIn,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [activeSection, reduceMotion, durationIn, sectionOpacity, sectionTranslateY]);

  const closeMenuAnimated = (callback?: () => void) => {
    if ((!menuVisible && !menuExiting) || menuExiting) return;
    setMenuExiting(true);
    Animated.parallel([
      Animated.timing(menuOverlayOpacity, {
        toValue: 0,
        duration: 150,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(menuDropdownScale, {
        toValue: 0.92,
        duration: 150,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      if (finished) {
        setMenuVisible(false);
        setMenuExiting(false);
        if (callback) callback();
      }
    });
  };

  const handleEdit = () => {
    closeMenuAnimated(() => {
      navigation.navigate('TripAlbumEdit', { albumId });
    });
  };

  const handleDelete = () => {
    closeMenuAnimated(() => {
      Alert.alert(
        'Are you sure you want to delete this album?',
        'Entries in this album will remain but will no longer be associated with it.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Yes, delete.',
            style: 'destructive',
            onPress: async () => {
              try {
                await deleteTripAlbum(albumId);
                navigation.goBack();
              } catch (error) {
                Alert.alert('Error', 'Failed to delete album. Please try again.');
              }
            },
          },
        ]
      );
    });
  };

  // Format date range
  const dateRange = useMemo(() => {
    if (!album) return '';
    const startDate = new Date(album.startDate);
    const endDate = album.endDate ? new Date(album.endDate) : null;
    return endDate
      ? `${startDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })} - ${endDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`
      : startDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  }, [album]);

  // Error state: album not found
  if (!album) {
    return (
      <View style={styles.container}>
        <MeshGradientBackground baseColor={colors.background} lightMode={!isDark} />
        <TouchableOpacity
          style={[styles.backButton, { top: topBarTop, left: 25 * scaleFactor, zIndex: 100 }]}
          onPress={handleBack}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <BackArrow width={19 * scaleFactor} height={21 * scaleFactor} color={colors.textPrimary} />
        </TouchableOpacity>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>Album not found</Text>
          <Text style={styles.errorSubtext}>This album may have been deleted</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <MeshGradientBackground baseColor={colors.background} lightMode={!isDark} />

      {/* Header */}
      <View style={[styles.header, { paddingTop: topBarTop }]}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={handleBack}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <BackArrow width={19 * scaleFactor} height={21 * scaleFactor} color={colors.textPrimary} />
        </TouchableOpacity>

        <View style={styles.headerContent}>
          <Text style={[styles.albumName, { fontSize: 24 * scaleFactor }]} numberOfLines={2}>
            {album.name}
          </Text>
          {album.locationName && (
            <Text style={[styles.albumLocation, { fontSize: 15 * scaleFactor }]} numberOfLines={1}>
              {album.locationName}
            </Text>
          )}
          <Text style={[styles.albumDate, { fontSize: 14 * scaleFactor }]}>{dateRange}</Text>
        </View>
      </View>

      {/* 3-dots menu button */}
      <TouchableOpacity
        style={[styles.menuButton, { top: topBarTop, right: 25 * scaleFactor }]}
        onPress={() => (menuVisible || menuExiting) ? closeMenuAnimated() : setMenuVisible(true)}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel="Album options"
      >
        <Text style={styles.menuButtonText}>...</Text>
      </TouchableOpacity>

      {/* Menu overlay - smooth open/close animation */}
      {(menuVisible || menuExiting) && (
        <Animated.View style={[styles.menuOverlay, { opacity: menuOverlayOpacity }]} pointerEvents="box-none">
          <TouchableWithoutFeedback onPress={() => closeMenuAnimated()}>
            <View style={StyleSheet.absoluteFill} />
          </TouchableWithoutFeedback>
          <Animated.View style={[styles.menuDropdown, { top: topBarTop + 40, right: 25 * scaleFactor, transform: [{ scale: menuDropdownScale }] }]} pointerEvents="box-none">
            <TouchableOpacity style={styles.menuOption} onPress={handleEdit} accessibilityRole="button" accessibilityLabel="Edit album" activeOpacity={0.7}>
              <Ionicons name="settings" size={20} color={colors.textPrimary} />
              <Text style={styles.menuOptionText}>Edit</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.menuOption} onPress={handleDelete} accessibilityRole="button" accessibilityLabel="Delete album" activeOpacity={0.7}>
              <Ionicons name="trash-outline" size={20} color="#DC2626" />
              <Text style={[styles.menuOptionText, styles.menuOptionTextDanger]}>Delete</Text>
            </TouchableOpacity>
          </Animated.View>
        </Animated.View>
      )}

      {/* Segment Control: same logic as Review (icon + label when active, icon only when inactive) */}
      <View style={styles.segmentContainer}>
        <TripAlbumSegmentControl
          activeSegment={activeSection}
          onSegmentChange={setActiveSection}
          onActiveSegmentPress={scrollActiveSectionToTop}
          onRecapPress={handleRecapPress}
          showRecap={tripFinished}
        />
      </View>

      {/* Content Sections with transition animation */}
      <Animated.View
        style={[
          styles.content,
          {
            opacity: sectionOpacity,
            transform: [{ translateY: sectionTranslateY }],
          },
        ]}
      >
        <View
          style={[styles.sectionPanel, { display: activeSection === 'all' ? 'flex' : 'none' }]}
          accessibilityElementsHidden={activeSection !== 'all'}
          importantForAccessibility={activeSection === 'all' ? 'auto' : 'no-hide-descendants'}
        >
          <BookmarksSection
            entries={albumEntries}
            journals={albumJournals}
            onEntryPress={handleEntryPress}
            onJournalPress={handleJournalPress}
            scrollRef={allScrollRef}
          />
        </View>
        <View
          style={[styles.sectionPanel, { display: activeSection === 'dashboard' ? 'flex' : 'none' }]}
          accessibilityElementsHidden={activeSection !== 'dashboard'}
          importantForAccessibility={activeSection === 'dashboard' ? 'auto' : 'no-hide-descendants'}
        >
          <DashboardSection
            entries={albumEntries}
            journals={albumJournals}
            tripAlbums={[album]}
            tripFilterActive
            isVisible={activeSection === 'dashboard'}
            scrollRef={dashboardScrollRef}
          />
        </View>
        <View
          style={[styles.sectionPanel, { display: activeSection === 'map' ? 'flex' : 'none' }]}
          accessibilityElementsHidden={activeSection !== 'map'}
          importantForAccessibility={activeSection === 'map' ? 'auto' : 'no-hide-descendants'}
        >
          <MapViewSection
            entries={albumEntries}
            journals={albumJournals}
            onEntryPress={handleEntryPress}
            onJournalPress={handleJournalPress}
            scrollRef={mapScrollRef}
          />
        </View>
      </Animated.View>
    </View>
  );
};

export default TripAlbumDetailScreen;
