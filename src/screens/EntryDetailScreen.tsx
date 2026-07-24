// EntryDetailScreen
// Full-screen entry detail view matching Figma design (node 342-81)

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Animated, Easing, Alert, TouchableWithoutFeedback, FlatList, PanResponder, useWindowDimensions, Modal } from 'react-native';
import MaskedView from '@react-native-masked-view/masked-view';
import { LinearGradient } from 'expo-linear-gradient';
import * as MediaLibrary from 'expo-media-library';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { useAppContext } from '../context/AppContext';
import { COLORS, DIMENSIONS, FONT_WEIGHTS, FONTS } from '../config/constants';
import { useTheme } from '../context/ThemeContext';
import { Entry } from '../models/Entry';
import BackArrow from '../components/common/icons/BackArrow';
import TrashIcon from '../components/common/icons/TrashIcon';
import { Ionicons } from '@expo/vector-icons';
import { formatLocationAndDate } from '../utils/dateUtils';
import { getEmojiForEmotionLabel } from '../utils/emotionUtils';
import LocationIcon from '../components/common/icons/LocationIcon';
import CalendarIcon from '../components/common/icons/CalendarIcon';
import { formatLocation, formatEntryDate, formatTemperature } from '../utils/dateUtils';
import { ZoomablePhoto } from '../components/common/ZoomablePhoto';
type EntryDetailScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, 'EntryDetail'>;
type EntryDetailScreenRouteProp = RouteProp<RootStackParamList, 'EntryDetail'>;

const EntryDetailScreen: React.FC = () => {
  const navigation = useNavigation<EntryDetailScreenNavigationProp>();
  const route = useRoute<EntryDetailScreenRouteProp>();
  const { colors, isDark } = useTheme();
  const { entryId } = route.params;
  const { entries, tripAlbums, journals, deleteEntry } = useAppContext();

  // Find entry
  const entry = useMemo(() => {
    return entries.find(e => e.id === entryId);
  }, [entries, entryId]);

  // Animation values
  const screenOpacity = useRef(new Animated.Value(0)).current;
  const contentTranslateY = useRef(new Animated.Value(20)).current;
  const imageScale = useRef(new Animated.Value(0.95)).current;

  // Menu state for 3-dots
  const [menuVisible, setMenuVisible] = useState(false);
  const [menuExiting, setMenuExiting] = useState(false);
  const menuOverlayOpacity = useRef(new Animated.Value(0)).current;
  const menuDropdownScale = useRef(new Animated.Value(0.92)).current;

  // Extra data (description, emotion, 6 categories) shown only after user taps "More Info..."
  const [showMoreInfo, setShowMoreInfo] = useState(false);

  // Carousel State
  const [activeSlide, setActiveSlide] = useState(0);
  const [carouselInteracting, setCarouselInteracting] = useState(false);
  const [inlinePhotoZoomed, setInlinePhotoZoomed] = useState(false);
  const [isPhotoViewerVisible, setIsPhotoViewerVisible] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(0);
  const [fullscreenPhotoZoomed, setFullscreenPhotoZoomed] = useState(false);
  const inlineZoomResetToken = useRef(0);
  const fullScreenListRef = useRef<FlatList<string> | null>(null);
  const carouselInteractionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onViewRef = useRef(({ viewableItems }: any) => {
    if (viewableItems.length > 0) {
      setActiveSlide(viewableItems[0].index || 0);
    }
  });
  const viewConfigRef = useRef({ viewAreaCoveragePercentThreshold: 50 });
  const onViewerViewRef = useRef(({ viewableItems }: any) => {
    if (viewableItems.length > 0) {
      const nextIndex = viewableItems[0].index || 0;
      setViewerIndex(nextIndex);
      setActiveSlide(nextIndex);
    }
  });

  // Responsive dimensions (safe area so content clears notch/home indicator)
  const insets = useSafeAreaInsets();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const scaleFactor = screenWidth / 390;
  const containerTop = insets.top + 74 * scaleFactor;

  // Journal drag handle: drag up past threshold or tap opens NotesEditor with entryId (branch journal)
  const DRAG_THRESHOLD = 60;
  const journalHandleResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onPanResponderRelease: (_, gestureState) => {
          const { dy, dx } = gestureState;
          if (dy < -DRAG_THRESHOLD || (Math.abs(dy) < 10 && Math.abs(dx) < 10)) {
            navigation.navigate('NotesEditor', { entryId });
          }
        },
      }),
    [navigation, entryId]
  );

  // Start animations on mount
  useEffect(() => {
    Animated.parallel([
      Animated.timing(screenOpacity, {
        toValue: 1,
        duration: 300,
        easing: Easing.bezier(0.4, 0.0, 0.2, 1.0),
        useNativeDriver: true,
      }),
      Animated.timing(contentTranslateY, {
        toValue: 0,
        duration: 350,
        delay: 50,
        easing: Easing.bezier(0.4, 0.0, 0.2, 1.0),
        useNativeDriver: true,
      }),
      Animated.timing(imageScale, {
        toValue: 1,
        duration: 400,
        delay: 100,
        easing: Easing.bezier(0.4, 0.0, 0.2, 1.0),
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

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
          easing: Easing.bezier(0.16, 1, 0.3, 1), // Ease-out for smooth deceleration
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [menuVisible, menuExiting]);

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

  // Format emotion text: "Felt (E1) and (E2)" or "Felt (E1), (E2), ... and (En)"; emoji from first emotion
  const emotionText = useMemo(() => {
    const labels = entry?.emotionLabels?.filter(Boolean) ?? [];
    if (labels.length === 0) return '';
    const lower = labels.map((l) => l.trim().toLowerCase()).filter(Boolean);
    if (lower.length === 0) return '';
    const emoji = getEmojiForEmotionLabel(labels[0]);
    if (lower.length === 1) {
      return `${emoji} Felt ${lower[0]}.`;
    }
    if (lower.length === 2) {
      return `${emoji} Felt ${lower[0]} and ${lower[1]}.`;
    }
    const rest = lower.slice(0, -1).join(', ');
    const last = lower[lower.length - 1];
    return `${emoji} Felt ${rest} and ${last}.`;
  }, [entry?.emotionLabels]);

  // Format location and date separately
  const [locationLabel, setLocationLabel] = useState<string>('');
  const [dateLabel, setDateLabel] = useState<string>('');
  const metadataOpacity = useRef(new Animated.Value(0)).current;

  const branchJournals = useMemo(
    () => (entry && journals ? journals.filter((j) => j.linkedEntryId === entry.id) : []),
    [entry, journals]
  );


  const linkedAlbum = useMemo(
    () => (entry?.albumId && tripAlbums ? tripAlbums.find((a) => a.id === entry.albumId) : null),
    [entry?.albumId, tripAlbums]
  );

  const [branchJournalListVisible, setBranchJournalListVisible] = useState(false);
  const [isDownloadingImage, setIsDownloadingImage] = useState(false);

  useEffect(() => {
    if (!entry) return;

    const loadMetadata = async () => {
      const dateStr = formatEntryDate(entry.timestamp);
      setDateLabel(dateStr);
      try {
        const loc = await formatLocation(entry);
        setLocationLabel(loc);
      } catch (e) {
        setLocationLabel('Location unavailable');
      }
      Animated.timing(metadataOpacity, {
        toValue: 1,
        duration: 200,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }).start();
    };

    loadMetadata();
  }, [entry]);

  // Handle back navigation
  const handleBack = () => {
    navigation.goBack();
  };

  const handleEdit = () => {
    closeMenuAnimated(() => {
      navigation.navigate('EntryEdit', { entryId });
    });
  };

  const handleJournal = () => {
    closeMenuAnimated(() => {
      navigation.navigate('NotesEditor', { entryId });
    });
  };

  const handleDelete = () => {
    closeMenuAnimated(() => {
      Alert.alert(
        'Are you sure you want to delete this?',
        undefined,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Yes, delete.',
            style: 'destructive',
            onPress: async () => {
              try {
                await deleteEntry(entryId);
                navigation.goBack();
              } catch (error) {
                Alert.alert('Error', 'Failed to delete entry. Please try again.');
              }
            },
          },
        ]
      );
    });
  };

  const handleDownloadImage = async () => {
    if (!entry || entry.mediaType !== 'photo' || !entry.photoPaths || entry.photoPaths.length === 0) {
      return;
    }
    const index = Math.min(Math.max(activeSlide, 0), entry.photoPaths.length - 1);
    const uri = entry.photoPaths[index];
    if (!uri) return;

    closeMenuAnimated(async () => {
      try {
        setIsDownloadingImage(true);
        const { status } = await MediaLibrary.requestPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert(
            'Permission needed',
            'Journey Onward needs access to your photo library to save images.'
          );
          return;
        }
        await MediaLibrary.createAssetAsync(uri);
        Alert.alert('Saved', 'Image saved to your Photos.');
      } catch (error) {
        Alert.alert('Error', 'Could not save image. Please try again.');
      } finally {
        setIsDownloadingImage(false);
      }
    });
  };

  const handleAlbumPress = () => {
    if (!linkedAlbum) return;
    closeMenuAnimated(() => {
      try {
        navigation.navigate('TripAlbumDetail', { albumId: linkedAlbum.id });
      } catch (error) {
        Alert.alert('Error', 'Could not open album.');
      }
    });
  };

  const handleBranchJournalsPress = () => {
    const count = branchJournals?.length ?? 0;
    if (count === 0) {
      return;
    }
    const openSingle = () => {
      const journal = branchJournals[0];
      try {
        navigation.navigate('JournalDetail', { journalId: journal.id });
      } catch (error) {
        Alert.alert('Error', 'Could not open journal.');
      }
    };
    if (count === 1) {
      closeMenuAnimated(openSingle);
      return;
    }
    setBranchJournalListVisible(true);
  };

  const openPhotoViewer = (index: number) => {
    setViewerIndex(index);
    setFullscreenPhotoZoomed(false);
    setIsPhotoViewerVisible(true);
  };

  const closePhotoViewer = () => {
    setIsPhotoViewerVisible(false);
    setFullscreenPhotoZoomed(false);
    inlineZoomResetToken.current += 1;
  };

  useEffect(() => {
    setInlinePhotoZoomed(false);
  }, [activeSlide]);

  useEffect(() => {
    return () => {
      if (carouselInteractionTimeoutRef.current) {
        clearTimeout(carouselInteractionTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!isPhotoViewerVisible || !entry?.photoPaths?.length) return;
    const timer = setTimeout(() => {
      fullScreenListRef.current?.scrollToIndex({
        index: Math.min(Math.max(viewerIndex, 0), entry.photoPaths.length - 1),
        animated: false,
      });
    }, 0);
    return () => clearTimeout(timer);
  }, [isPhotoViewerVisible, viewerIndex, entry?.photoPaths]);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: { flex: 1, backgroundColor: colors.background },
        scrollView: { flex: 1 },
        scrollContent: { flexGrow: 1 },
        backButton: { position: 'absolute', zIndex: 10, padding: 8 },
        menuButton: { position: 'absolute', zIndex: 100, padding: 8, paddingHorizontal: 12 },
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
        scrollContentInner: {
          paddingBottom: 32,
        },
        imageHeaderRow: {
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          zIndex: 10,
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          paddingTop: 20,
          paddingHorizontal: 25,
          minHeight: 52,
        },
        imageWrapper: {
          width: screenWidth,
          marginHorizontal: 0,
        },
        imageWrapperWithHeader: {
          position: 'relative',
          width: screenWidth,
        },
        sectionPadding: {
          paddingHorizontal: 25,
        },
        sectionTitle: {
          fontFamily: FONTS.inter,
          fontWeight: FONT_WEIGHTS.semibold,
          color: colors.textPrimary,
          marginTop: 16,
          marginBottom: 4,
        },
        sectionSpacer: {
          height: 12,
        },
        dataGridFull: {
          flexDirection: 'row',
          flexWrap: 'wrap',
          marginTop: 16,
          marginBottom: 8,
        },
        imageContainer: {
          position: 'absolute',
          backgroundColor: colors.stone600,
          borderRadius: 7,
          borderWidth: 2,
          borderColor: colors.borderLight,
          overflow: 'hidden',
        },
        mediaPlaceholder: {
          ...StyleSheet.absoluteFillObject,
          backgroundColor: colors.stone600,
          justifyContent: 'center',
          alignItems: 'center',
        },
        mediaIcon: { fontSize: 48, marginBottom: 8 },
        mediaLabel: {
          fontFamily: FONTS.inter,
          fontSize: 16,
          fontWeight: FONT_WEIGHTS.semibold,
          color: colors.textPrimary,
        },
        title: { position: 'absolute', fontFamily: FONTS.inter, fontWeight: FONT_WEIGHTS.semibold, color: colors.textPrimary },
        titleRow: { flexDirection: 'row', alignItems: 'center', flex: 1 },
        locationDate: { position: 'absolute', fontFamily: FONTS.inter, fontWeight: FONT_WEIGHTS.regular, color: colors.textSecondary },
        description: { position: 'absolute', fontFamily: FONTS.inter, fontWeight: FONT_WEIGHTS.bold, fontStyle: 'italic', color: colors.textTertiary },
        emotion: { position: 'absolute', fontFamily: FONTS.inter, fontWeight: FONT_WEIGHTS.regular, color: colors.textSecondary },
        errorContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32 },
        errorText: {
          fontFamily: FONTS.inter,
          fontSize: 18,
          fontWeight: FONT_WEIGHTS.semibold,
          color: colors.textPrimary,
          marginBottom: 8,
          textAlign: 'center',
        },
        errorSubtext: { fontFamily: FONTS.inter, fontSize: 14, fontWeight: FONT_WEIGHTS.regular, color: colors.textSecondary, textAlign: 'center' },
        aura: { margin: -5 },
        paginationContainer: { position: 'absolute', bottom: 20, left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', alignItems: 'center' },
        paginationDot: { width: 6, height: 6, borderRadius: 3, marginHorizontal: 4 },
        paginationDotActive: { backgroundColor: colors.surface },
        paginationDotInactive: { backgroundColor: 'rgba(255,255,255,0.4)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' },
        journalHandle: {
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          paddingTop: 12,
          paddingHorizontal: 24,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.background,
        },
        journalHandleTouchable: { paddingVertical: 8, paddingHorizontal: 16 },
        journalHandleText: { fontFamily: FONTS.inter, fontSize: 15, fontWeight: FONT_WEIGHTS.semibold, color: colors.textTertiary },
        showMoreLink: {
          fontFamily: FONTS.inter,
          fontSize: 12,
          fontWeight: FONT_WEIGHTS.bold,
          fontStyle: 'italic',
          color: '#707070',
        },
        dataGrid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 12 },
        dataGridCell: {
          width: '50%',
          alignItems: 'center',
          marginBottom: 18,
        },
        dataGridValue: {
          fontFamily: FONTS.inter,
          fontSize: 26,
          fontWeight: FONT_WEIGHTS.bold,
          color: isDark ? '#e4e4e4' : colors.textPrimary,
        },
        dataGridLabel: {
          fontFamily: FONTS.inter,
          fontSize: 12,
          color: isDark ? '#707070' : colors.textSecondary,
          marginTop: 4,
        },
        writeAboutButton: {
          backgroundColor: isDark ? COLORS.buttonGray : colors.surfaceVariant,
          borderWidth: 1,
          borderColor: isDark ? colors.textPrimary : colors.border,
          borderRadius: 24,
          height: 48,
          minWidth: 280,
          paddingHorizontal: 24,
          justifyContent: 'center',
          alignItems: 'center',
        },
        writeAboutButtonText: {
          fontFamily: FONTS.inter,
          fontSize: 12,
          fontWeight: FONT_WEIGHTS.bold,
          color: colors.textPrimary,
        },
        photoViewerBackdrop: {
          flex: 1,
          backgroundColor: '#000',
        },
        photoViewerHeader: {
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          zIndex: 10,
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          paddingHorizontal: 20,
          paddingTop: 12,
        },
        photoViewerCounter: {
          color: '#FFFFFF',
          fontFamily: FONTS.inter,
          fontSize: 14,
          fontWeight: FONT_WEIGHTS.semibold,
        },
        photoViewerCloseButton: {
          paddingHorizontal: 12,
          paddingVertical: 8,
        },
        photoViewerCloseText: {
          color: '#FFFFFF',
          fontFamily: FONTS.inter,
          fontSize: 16,
          fontWeight: FONT_WEIGHTS.bold,
        },
        fullScreenPhotoSlide: {
          justifyContent: 'center',
          alignItems: 'center',
        },
      }),
    [colors, isDark, screenWidth]
  );

  // Error state: entry not found
  if (!entry) {
    return (
      <View style={styles.container}>
        <TouchableOpacity
          style={[styles.backButton, {
            top: (107.07 - 74 + 20) * scaleFactor, // Image starts at 107.07, container at 74, so 20px into image area (much more reachable)
            left: 25 * scaleFactor,
            zIndex: 100,
          }]}
          onPress={handleBack}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <BackArrow width={19 * scaleFactor} height={21 * scaleFactor} color={colors.textPrimary} />
        </TouchableOpacity>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>Entry not found</Text>
          <Text style={styles.errorSubtext}>This entry may have been deleted</Text>
        </View>
      </View>
    );
  }

  // Get image URI
  const imageUri = entry.mediaType === 'photo' && entry.photoPaths && entry.photoPaths.length > 0
    ? entry.photoPaths[0]
    : null;

  const imageWidth = 344 * scaleFactor;
  const imageHeight = 463.033 * scaleFactor;
  const menuDropdownTop = Number.isFinite(insets?.top) ? insets.top + 56 : 56;

  return (
    <Animated.View style={[styles.container, { opacity: screenOpacity }]}>
      {/* Menu overlay - fixed so dropdown is visible regardless of scroll */}
      {(menuVisible || menuExiting) && (
        <Animated.View style={[styles.menuOverlay, { opacity: menuOverlayOpacity }]} pointerEvents="box-none">
          <TouchableWithoutFeedback onPress={() => closeMenuAnimated()}>
            <View style={StyleSheet.absoluteFill} />
          </TouchableWithoutFeedback>
          <Animated.View
            style={[styles.menuDropdown, { top: menuDropdownTop, right: 25 * scaleFactor, transform: [{ scale: menuDropdownScale }] }]}
            pointerEvents="box-none"
          >
            <TouchableOpacity
              style={styles.menuOption}
              onPress={handleJournal}
              accessibilityRole="button"
              accessibilityLabel="Create journal from experience"
              activeOpacity={0.7}
            >
              <Ionicons name="create-outline" size={20} color={colors.textPrimary} />
              <Text style={styles.menuOptionText}>Journal</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.menuOption}
              onPress={handleEdit}
              accessibilityRole="button"
              accessibilityLabel="Edit entry"
              activeOpacity={0.7}
            >
              <Ionicons name="settings" size={20} color={colors.textPrimary} />
              <Text style={styles.menuOptionText}>Edit</Text>
            </TouchableOpacity>
            {entry.mediaType === 'photo' && entry.photoPaths && entry.photoPaths.length > 0 && (
              <TouchableOpacity
                style={styles.menuOption}
                onPress={handleDownloadImage}
                accessibilityRole="button"
                accessibilityLabel="Download image to Photos"
                activeOpacity={0.7}
                disabled={isDownloadingImage}
              >
                <Ionicons name="download-outline" size={20} color={colors.textPrimary} />
                <Text style={styles.menuOptionText}>
                  {isDownloadingImage ? 'Saving…' : 'Download image to Photos'}
                </Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={styles.menuOption}
              onPress={handleDelete}
              accessibilityRole="button"
              accessibilityLabel="Delete entry"
              activeOpacity={0.7}
            >
              <TrashIcon width={20} height={20} color="#DC2626" />
              <Text style={[styles.menuOptionText, styles.menuOptionTextDanger]}>Delete</Text>
            </TouchableOpacity>
          </Animated.View>
        </Animated.View>
      )}

      {/* Back and 3-dots: fixed above content so they always stay visible (same layer as scroll, do not scroll) */}
      {!isPhotoViewerVisible && (
        <>
          <TouchableOpacity
            style={[styles.backButton, { top: (Number.isFinite(insets?.top) ? insets.top : 0) + 20, left: 25 * scaleFactor }]}
            onPress={handleBack}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Back"
          >
            <BackArrow width={19 * scaleFactor} height={21 * scaleFactor} color={colors.textPrimary} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.menuButton, { top: (Number.isFinite(insets?.top) ? insets.top : 0) + 20, right: 25 * scaleFactor }]}
            onPress={() => (menuVisible || menuExiting) ? closeMenuAnimated() : setMenuVisible(true)}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Entry options"
          >
            <Text style={styles.menuButtonText}>...</Text>
          </TouchableOpacity>
        </>
      )}

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.scrollContent, styles.scrollContentInner, { paddingTop: containerTop, paddingBottom: (Number.isFinite(insets?.bottom) ? insets.bottom : 0) + 100 }]}
        showsVerticalScrollIndicator={false}
        scrollEnabled={!inlinePhotoZoomed && !isPhotoViewerVisible}
      >
        <Animated.View style={{ transform: [{ translateY: contentTranslateY }] }}>
          {/* Image - no header inside; back/menu are fixed above */}
          <View style={[styles.imageWrapperWithHeader, { minHeight: imageHeight }]}>
            <Animated.View
              style={[
                styles.imageContainer,
                {
                  width: imageWidth,
                  height: imageHeight,
                  alignSelf: 'center',
                  borderRadius: 7,
                  transform: [{ scale: imageScale }],
                },
              ]}
            >
            {imageUri ? (
              entry.photoPaths && entry.photoPaths.length > 1 ? (
                // Carousel View
                <View style={{ flex: 1 }}>
                  <FlatList
                    data={entry.photoPaths}
                    renderItem={({ item, index }) => (
                      <ZoomablePhoto
                        uri={item}
                        width={344 * scaleFactor}
                        height={463.033 * scaleFactor}
                        resizeMode="cover"
                        fallbackBackgroundColor={colors.surface}
                        isActive={index === activeSlide}
                        resetKey={`${activeSlide}-${inlineZoomResetToken.current}`}
                        suppressTap={carouselInteracting}
                        onTap={() => openPhotoViewer(index)}
                        onZoomStateChange={(zoomed) => {
                          if (index === activeSlide) {
                            setInlinePhotoZoomed(zoomed);
                          }
                        }}
                      />
                    )}
                    horizontal
                    pagingEnabled
                    scrollEnabled={!inlinePhotoZoomed}
                    showsHorizontalScrollIndicator={false}
                    onScrollBeginDrag={() => {
                      if (carouselInteractionTimeoutRef.current) {
                        clearTimeout(carouselInteractionTimeoutRef.current);
                      }
                      setCarouselInteracting(true);
                    }}
                    onScrollEndDrag={() => {
                      if (carouselInteractionTimeoutRef.current) {
                        clearTimeout(carouselInteractionTimeoutRef.current);
                      }
                      carouselInteractionTimeoutRef.current = setTimeout(() => {
                        setCarouselInteracting(false);
                      }, 160);
                    }}
                    onMomentumScrollBegin={() => {
                      if (carouselInteractionTimeoutRef.current) {
                        clearTimeout(carouselInteractionTimeoutRef.current);
                      }
                      setCarouselInteracting(true);
                    }}
                    onMomentumScrollEnd={() => {
                      if (carouselInteractionTimeoutRef.current) {
                        clearTimeout(carouselInteractionTimeoutRef.current);
                        carouselInteractionTimeoutRef.current = null;
                      }
                      setCarouselInteracting(false);
                    }}
                    onViewableItemsChanged={onViewRef.current}
                    viewabilityConfig={viewConfigRef.current}
                    keyExtractor={(item) => item}
                  />
                  <View style={styles.paginationContainer}>
                    {entry.photoPaths.map((_, index) => (
                      <View
                        key={index}
                        style={[
                          styles.paginationDot,
                          index === activeSlide ? styles.paginationDotActive : styles.paginationDotInactive,
                        ]}
                      />
                    ))}
                  </View>
                </View>
              ) : (
                // Single Image View
                <ZoomablePhoto
                  uri={imageUri}
                  width={imageWidth}
                  height={imageHeight}
                  resizeMode="cover"
                  fallbackBackgroundColor={colors.surface}
                  resetKey={inlineZoomResetToken.current}
                  onTap={() => openPhotoViewer(0)}
                  onZoomStateChange={setInlinePhotoZoomed}
                />
              )
            ) : entry.mediaType === 'video' ? (
              <View style={styles.mediaPlaceholder}>
                <Text style={styles.mediaIcon}>🎥</Text>
                <Text style={styles.mediaLabel}>Video</Text>
              </View>
            ) : entry.mediaType === 'audio' ? (
              <View style={styles.mediaPlaceholder}>
                <Text style={styles.mediaIcon}>🎵</Text>
                <Text style={styles.mediaLabel}>Audio</Text>
              </View>
            ) : (
              <View style={styles.mediaPlaceholder}>
                <Text style={styles.mediaIcon}>📷</Text>
                <Text style={styles.mediaLabel}>No Media</Text>
              </View>
            )}
          </Animated.View>
          </View>

          {/* Title (flow layout) */}
          <View style={[styles.sectionPadding, { marginTop: 16 }]}>
            {(entry.title || entry.isBookmarked) ? (
              entry.isBookmarked ? (
                <View style={[styles.titleRow, { minHeight: 24 * scaleFactor }]}>
                  <MaskedView
                    style={{ flexDirection: 'row', alignItems: 'center', flex: 1, minHeight: 24 * scaleFactor }}
                    maskElement={
                      <View style={styles.titleRow}>
                        <View style={{ marginRight: 6 }}>
                          <Ionicons name="compass-outline" size={15 * scaleFactor} color="white" />
                        </View>
                        <Text
                          style={[styles.title, { position: 'relative', fontSize: 10 * scaleFactor, flex: 1, backgroundColor: 'transparent', color: 'white' }]}
                          numberOfLines={2}
                        >
                          {entry.title || '(Untitled)'}
                        </Text>
                      </View>
                    }
                  >
                    <LinearGradient
                      colors={[COLORS.babyBlue, COLORS.royalGold, COLORS.fern]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={StyleSheet.absoluteFill}
                    />
                  </MaskedView>
                </View>
              ) : (
                <Text style={[styles.title, { position: 'relative', fontSize: 18 * scaleFactor, left: 0, right: 0 }]} numberOfLines={3}>
                  {entry.title}
                </Text>
              )
            ) : null}

            {/* Location and Date */}
            {(locationLabel || dateLabel) ? (
              <View style={{ marginTop: 8 }}>
                {locationLabel ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 * scaleFactor }}>
                    <LocationIcon width={12 * scaleFactor} height={12 * scaleFactor} color={colors.textPrimary} />
                    <Text style={[styles.locationDate, { position: 'relative', marginLeft: 10 * scaleFactor, fontSize: 12 * scaleFactor }]}>
                      {locationLabel}
                    </Text>
                  </View>
                ) : null}
                {dateLabel ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 * scaleFactor }}>
                    <CalendarIcon width={12 * scaleFactor} height={12 * scaleFactor} color={colors.textPrimary} />
                    <Text style={[styles.locationDate, { position: 'relative', marginLeft: 10 * scaleFactor, fontSize: 12 * scaleFactor }]}>
                      {dateLabel}
                    </Text>
                  </View>
                ) : null}
              </View>
            ) : null}

            {/* More Info... / Show less - extra data only when expanded */}
            {(() => {
              const hasMoreInfo = Boolean(
                (entry.description && entry.description.trim().length > 0) ||
                emotionText ||
                entry.temperatureCelsius != null ||
                (entry.weather && entry.weather.trim().length > 0) ||
                entry.season ||
                entry.altitudeMeters != null ||
                linkedAlbum ||
                (branchJournals?.length ?? 0) > 0 ||
                (entry.emotionNote && entry.emotionNote.trim().length > 0)
              );
              if (!hasMoreInfo) return null;
              if (!showMoreInfo) {
                return (
                  <TouchableOpacity
                    style={{ marginTop: 12 }}
                    onPress={() => setShowMoreInfo(true)}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityLabel="Show more info"
                  >
                    <Text style={styles.showMoreLink}>More Info...</Text>
                  </TouchableOpacity>
                );
              }
              return (
                <>
                  <TouchableOpacity
                    style={{ marginTop: 12, marginBottom: 4 }}
                    onPress={() => setShowMoreInfo(false)}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityLabel="Show less"
                  >
                    <Text style={styles.showMoreLink}>Show less</Text>
                  </TouchableOpacity>
                  {entry.description && entry.description.trim().length > 0 && (
                    <Text style={[styles.description, { position: 'relative', fontSize: 14 * scaleFactor, width: '100%', marginTop: 8, marginBottom: 4, fontStyle: 'italic' }]}>
                      "{entry.description.trim()}"
                    </Text>
                  )}
                  {emotionText ? (
                    <Text style={[styles.emotion, { position: 'relative', fontSize: 14 * scaleFactor, marginTop: 8, marginBottom: 4 }]}>
                      {emotionText}
                    </Text>
                  ) : null}
                </>
              );
            })()}
          </View>

          {/* 6 categories - only when More Info expanded */}
          {showMoreInfo && (
            <>
              <View style={[styles.sectionPadding, styles.dataGridFull]}>
                <View style={styles.dataGridCell}>
                  <Text style={styles.dataGridValue}>{entry.temperatureCelsius != null ? formatTemperature(entry.temperatureCelsius) : '—'}</Text>
                  <Text style={styles.dataGridLabel}>Temperature</Text>
                </View>
                <View style={styles.dataGridCell}>
                  {entry.weather && entry.weather.trim().length > 0 ? (
                    <>
                      <Ionicons name="partly-sunny-outline" size={28} color={colors.textPrimary} style={{ marginBottom: 4 }} />
                      <Text style={[styles.dataGridValue, { fontSize: 16 }]}>{entry.weather.trim()}</Text>
                    </>
                  ) : (
                    <Text style={styles.dataGridValue}>—</Text>
                  )}
                  <Text style={styles.dataGridLabel}>Weather</Text>
                </View>
                <View style={styles.dataGridCell}>
                  <Text style={styles.dataGridValue}>{entry.season ? entry.season.charAt(0).toUpperCase() + entry.season.slice(1) : '—'}</Text>
                  <Text style={styles.dataGridLabel}>Season</Text>
                </View>
                <View style={styles.dataGridCell}>
                  <Text style={styles.dataGridValue}>
                    {entry.altitudeMeters != null ? `${Math.round(entry.altitudeMeters)}m` : '—'}
                  </Text>
                  <Text style={styles.dataGridLabel}>Altitude{entry.altitudeMeters != null ? ' AMSL' : ''}</Text>
                </View>
                <View style={styles.dataGridCell}>
                  {linkedAlbum ? (
                    <TouchableOpacity
                      onPress={handleAlbumPress}
                      activeOpacity={0.7}
                      accessibilityRole="button"
                      accessibilityLabel="Open trip album for this entry"
                    >
                      <Text style={styles.dataGridValue}>Saved to 1</Text>
                      <Text style={styles.dataGridLabel}>Album</Text>
                    </TouchableOpacity>
                  ) : (
                    <>
                      <Text style={styles.dataGridValue}>—</Text>
                      <Text style={styles.dataGridLabel}>Album</Text>
                    </>
                  )}
                </View>
                <View style={styles.dataGridCell}>
                  {branchJournals && branchJournals.length > 0 ? (
                    <TouchableOpacity
                      onPress={handleBranchJournalsPress}
                      activeOpacity={0.7}
                      accessibilityRole="button"
                      accessibilityLabel="Open branch journals for this entry"
                    >
                      <Text style={styles.dataGridValue}>{String(branchJournals.length)}</Text>
                      <Text style={styles.dataGridLabel}>Branch Journals</Text>
                    </TouchableOpacity>
                  ) : (
                    <>
                      <Text style={styles.dataGridValue}>0</Text>
                      <Text style={styles.dataGridLabel}>Branch Journals</Text>
                    </>
                  )}
                </View>
              </View>

              {entry.emotionNote && entry.emotionNote.trim().length > 0 && (
                <View style={[styles.sectionPadding, { marginTop: 8 }]}>
                  <Text style={[styles.description, { position: 'relative', fontSize: 12 * scaleFactor, width: '100%', fontStyle: 'italic' }]}>
                    {entry.emotionNote.trim()}
                  </Text>
                </View>
              )}
            </>
          )}

          {/* Write About This Experience - inside scroll so no force scroll */}
          <View style={[styles.sectionPadding, { marginTop: 24, marginBottom: 24, alignItems: 'center' }]}>
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => navigation.navigate('NotesEditor', { entryId })}
              style={[styles.writeAboutButton, { flexDirection: 'row', gap: 8 }]}
              accessibilityRole="button"
              accessibilityLabel="Write about this experience"
              {...journalHandleResponder.panHandlers}
            >
              <Ionicons name="create-outline" size={16} color={colors.textPrimary} />
              <Text style={styles.writeAboutButtonText}>Write About This Experience</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      </ScrollView>
      <Modal
        visible={isPhotoViewerVisible}
        animationType="fade"
        transparent={false}
        onRequestClose={closePhotoViewer}
      >
        <View style={styles.photoViewerBackdrop}>
          <View style={[styles.photoViewerHeader, { paddingTop: (Number.isFinite(insets?.top) ? insets.top : 0) + 4 }]}>
            <Text style={styles.photoViewerCounter}>
              {entry.photoPaths && entry.photoPaths.length > 0 ? `${viewerIndex + 1} / ${entry.photoPaths.length}` : ''}
            </Text>
            <TouchableOpacity
              onPress={closePhotoViewer}
              style={styles.photoViewerCloseButton}
              accessibilityRole="button"
              accessibilityLabel="Close full screen photo viewer"
              activeOpacity={0.8}
            >
              <Text style={styles.photoViewerCloseText}>Close</Text>
            </TouchableOpacity>
          </View>
          <FlatList
            ref={fullScreenListRef}
            data={entry.photoPaths ?? []}
            keyExtractor={(item, index) => `${item}-${index}`}
            horizontal
            pagingEnabled
            scrollEnabled={!fullscreenPhotoZoomed}
            initialScrollIndex={Math.min(Math.max(viewerIndex, 0), Math.max((entry.photoPaths?.length ?? 1) - 1, 0))}
            getItemLayout={(_, index) => ({
              length: screenWidth,
              offset: screenWidth * index,
              index,
            })}
            onViewableItemsChanged={onViewerViewRef.current}
            viewabilityConfig={viewConfigRef.current}
            renderItem={({ item, index }) => (
              <View style={[styles.fullScreenPhotoSlide, { width: screenWidth }]}>
                <ZoomablePhoto
                  uri={item}
                  width={screenWidth}
                  height={Math.max(1, screenHeight - ((Number.isFinite(insets?.top) ? insets.top : 0) + (Number.isFinite(insets?.bottom) ? insets.bottom : 0)))}
                  resizeMode="contain"
                  fallbackBackgroundColor="#000000"
                  isActive={index === viewerIndex}
                  resetKey={`${viewerIndex}-${isPhotoViewerVisible ? 1 : 0}`}
                  onZoomStateChange={(zoomed) => {
                    if (index === viewerIndex) {
                      setFullscreenPhotoZoomed(zoomed);
                    }
                  }}
                />
              </View>
            )}
          />
        </View>
      </Modal>
      <Modal
        visible={branchJournalListVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setBranchJournalListVisible(false)}
      >
        <TouchableWithoutFeedback onPress={() => setBranchJournalListVisible(false)}>
          <View
            style={{
              flex: 1,
              backgroundColor: 'rgba(0,0,0,0.4)',
              justifyContent: 'center',
              alignItems: 'center',
            }}
          >
            <TouchableWithoutFeedback>
              <View
                style={{
                  width: '85%',
                  maxHeight: '60%',
                  backgroundColor: colors.surface,
                  borderRadius: 12,
                  padding: 16,
                }}
              >
                <Text
                  style={{
                    fontFamily: FONTS.inter,
                    fontSize: 16,
                    fontWeight: FONT_WEIGHTS.semibold,
                    color: colors.textPrimary,
                    marginBottom: 12,
                  }}
                >
                  Branch Journals
                </Text>
                {branchJournals && branchJournals.length > 0 ? (
                  <ScrollView>
                    {branchJournals.map((journal) => (
                      <TouchableOpacity
                        key={journal.id}
                        style={{ paddingVertical: 10 }}
                        onPress={() => {
                          setBranchJournalListVisible(false);
                          try {
                            navigation.navigate('JournalDetail', { journalId: journal.id });
                          } catch (error) {
                            Alert.alert('Error', 'Could not open journal.');
                          }
                        }}
                      >
                        <Text
                          style={{
                            fontFamily: FONTS.inter,
                            fontSize: 14,
                            fontWeight: FONT_WEIGHTS.semibold,
                            color: colors.textPrimary,
                          }}
                          numberOfLines={1}
                        >
                          {journal.title || 'Journal'}
                        </Text>
                        {journal.content ? (
                          <Text
                            style={{
                              fontFamily: FONTS.inter,
                              fontSize: 12,
                              color: colors.textSecondary,
                              marginTop: 2,
                            }}
                            numberOfLines={2}
                          >
                            {journal.content}
                          </Text>
                        ) : null}
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                ) : (
                  <Text
                    style={{
                      fontFamily: FONTS.inter,
                      fontSize: 14,
                      color: colors.textSecondary,
                    }}
                  >
                    No branch journals found for this entry.
                  </Text>
                )}
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </Animated.View>
  );
};

export default EntryDetailScreen;
