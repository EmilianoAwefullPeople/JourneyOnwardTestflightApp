// AddPastExperiencesScreen
// Allows users to select photos from gallery and create a multi-image entry.
// Refactored to follow CaptureScreen flow: Selection -> Title -> Details -> Save.

import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, Image, FlatList, TextInput, Dimensions, Keyboard, Animated, ScrollView, Platform, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { COLORS, FONTS, DIMENSIONS, FONT_WEIGHTS, SPACING } from '../config/constants';
import { BOTTOM_SAFE_BUFFER, getAvailableHeight } from '../utils/layout';
import { useTheme } from '../context/ThemeContext';
import type { ThemeColors } from '../config/theme';
import { MeshGradientBackground } from '../components/common/MeshGradientBackground';
import BackArrow from '../components/common/icons/BackArrow';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import GradientText from '../components/common/GradientText';
import CompassIcon from '../components/common/icons/CompassIcon';
import { LinearGradient } from 'expo-linear-gradient';
import PenIcon from '../components/common/icons/PenIcon';
import HeartIcon from '../components/common/icons/HeartIcon';
import { useAppContext } from '../context/AppContext';
import { useProgress } from '../context/ProgressContext';
import { logger } from '../utils/logger';
import { generateUUID } from '../utils/uuid';
import { getDecimalCoordinatesFromExif } from '../utils/exifGps';
import { findMatchingAlbumId } from '../utils/albumUtils';
import { getSeasonFromTimestamp } from '../utils/seasonUtils';
import { getWeatherAtLocation } from '../services/WeatherService';
import { Entry } from '../models/Entry';
import { attachCountryToEntryIfMissing } from '../utils/entryCountryResolve';
import { copyMediaToPersistentStorage } from '../storage/mediaStorage';
import { ANIMATION_CONFIG } from '../utils/animations';
import EmotionalCaptureFlow from '../components/capture/EmotionalCaptureFlow';

// --- Types ---
type AddPastExperiencesNavigationProp = NativeStackNavigationProp<RootStackParamList, 'AddPastExperiences'>;

type SelectedImage = {
  uri: string;
  width: number;
  height: number;
  exif?: any;
};

type Step = 'selection' | 'title' | 'details';

// --- Screen ---
const AddPastExperiencesScreen: React.FC = () => {
  const navigation = useNavigation<AddPastExperiencesNavigationProp>();
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const { createEntry, tripAlbums } = useAppContext();
  const { record } = useProgress();

  // State
  const [step, setStep] = useState<Step>('selection');
  const [selectedImages, setSelectedImages] = useState<SelectedImage[]>([]);

  // Editor State
  const [activeSlide, setActiveSlide] = useState(0);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [isAweTagged, setIsAweTagged] = useState(false);
  const [emotionLabels, setEmotionLabels] = useState<string[]>([]);
  const [emotionNote, setEmotionNote] = useState<string>('');
  const [userSkippedTitle, setUserSkippedTitle] = useState(false);

  // UI State toggles (mimicking CaptureScreen overlays)
  const [showDescriptionInput, setShowDescriptionInput] = useState(false);
  const [showEmotionPicker, setShowEmotionPicker] = useState(false);
  const [descriptionText, setDescriptionText] = useState(''); // In-progress text in description overlay

  // Keyboard state (matching CaptureScreen)
  const [showTitleInput, setShowTitleInput] = useState(false);
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const titleInputRef = useRef<TextInput>(null);
  const descriptionInputRef = useRef<TextInput>(null);
  const titleRef = useRef<string>('');
  const stepRef = useRef<Step>('selection');

  // Title-step layout: image animation when keyboard opens (match CaptureScreen)
  const imageScale = useRef(new Animated.Value(1)).current;
  const imageTranslateY = useRef(new Animated.Value(0)).current;

  // Description overlay animation (match CaptureScreen)
  const descriptionBlurOpacity = useRef(new Animated.Value(0)).current;
  const descriptionContainerTranslateY = useRef(new Animated.Value(100)).current;
  const descriptionCloseButtonOpacity = useRef(new Animated.Value(0)).current;
  const descriptionSaveButtonOpacity = useRef(new Animated.Value(0)).current;

  // Emotion overlay animation (match CaptureScreen)
  const emotionBlurOpacity = useRef(new Animated.Value(0)).current;
  const emotionContainerTranslateY = useRef(new Animated.Value(100)).current;
  const emotionCloseButtonOpacity = useRef(new Animated.Value(0)).current;

  // Animations/Dimensions from current window (safe area applied so content clears notch/home indicator)
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const scaleFactor = Math.min(Math.max(windowWidth, 320), 430) / 390;
  const containerTop = insets.top + 74 * scaleFactor;
  const containerBottomInset = Number.isFinite(insets.bottom) ? insets.bottom : 0;
  const availableHeight = getAvailableHeight(windowHeight, { top: insets.top, bottom: containerBottomInset }, containerTop);

  // Title-step layout: same as CaptureScreen (positionsClosed, getPositionsOpen, currentPositions)
  const positionsClosed = useMemo(() => ({
    imageWidth: 344 * scaleFactor,
    imageHeight: 463.033 * scaleFactor,
    imageLeft: 25 * scaleFactor,
    imageTop: 107.07 * scaleFactor - containerTop,
    titleTextTop: 531 * scaleFactor,
    titleTextLeft: 25 * scaleFactor,
    titleTextWidth: windowWidth - 49 * scaleFactor,
    containerHeight: 800 * scaleFactor,
  }), [scaleFactor, containerTop, windowWidth]);

  const imageScaleExtraData = windowWidth < 380 ? 0.75 : 0.85;
  const imageBottomDetails = positionsClosed.imageTop + positionsClosed.imageHeight * imageScaleExtraData;
  const titleOffsetDown = Number.isFinite(windowHeight) ? windowHeight * 0.05 : 0;
  const bottomSafeInset = Number.isFinite(DIMENSIONS.extraDataBottomSafeInset)
    ? DIMENSIONS.extraDataBottomSafeInset
    : 28;
  const detailsTitleTop = imageBottomDetails + SPACING.md + titleOffsetDown - bottomSafeInset;
  const detailsAddMoreTop = detailsTitleTop + 28 * scaleFactor + SPACING.xs;
  const detailsButtonsTop = detailsAddMoreTop + 14 * scaleFactor + SPACING.sm;
  const buttonRowHeight = 36 * scaleFactor;
  const buttonRowGap = 10 * scaleFactor;
  const detailsSaveTop = detailsButtonsTop + buttonRowHeight + buttonRowGap + buttonRowHeight + SPACING.xl;

  const getPositionsOpen = useCallback(() => {
    const screenHeight = Dimensions.get('window').height;
    const keyboardTopAbsolute = keyboardHeight > 0
      ? screenHeight - keyboardHeight
      : 516 * scaleFactor;
    const keyboardTopRelative = keyboardTopAbsolute - containerTop;
    return {
      imageWidth: 356 * scaleFactor,
      imageHeight: 479.185 * scaleFactor,
      imageLeft: 19 * scaleFactor,
      imageTop: 189 * scaleFactor - containerTop,
      titleInputTop: 164 * scaleFactor - containerTop,
      titleInputWidth: 258 * scaleFactor,
      titleInputLeft: (windowWidth - 258 * scaleFactor) / 2,
      containerHeight: keyboardTopRelative,
    };
  }, [keyboardHeight, scaleFactor, containerTop, windowWidth]);

  const currentPositions = useMemo(() => {
    if (step === 'title' && isKeyboardOpen) {
      return getPositionsOpen();
    }
    return positionsClosed;
  }, [step, isKeyboardOpen, positionsClosed, getPositionsOpen]);

  // Keep refs in sync for keyboard listener
  useEffect(() => {
    titleRef.current = title;
  }, [title]);
  useEffect(() => {
    stepRef.current = step;
  }, [step]);

  // Carousel Ref
  const onViewRef = useRef(({ viewableItems }: any) => {
    if (viewableItems.length > 0) {
      setActiveSlide(viewableItems[0].index || 0);
    }
  });
  const viewConfigRef = useRef({ viewAreaCoveragePercentThreshold: 50 });

  const styles = useMemo(() => createAddPastStyles(colors), [colors]);

  // Keyboard event listeners (match CaptureScreen: keyboardHeight, image animation)
  useEffect(() => {
    const keyboardShowEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const keyboardHideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSubscription = Keyboard.addListener(keyboardShowEvent, (e) => {
      const height = e?.endCoordinates?.height ?? 0;
      const duration = e?.duration ?? 300;
      setKeyboardHeight(height);
      setIsKeyboardOpen(true);
      // Animate image: scale 0.85, translateY -30 (title step)
      Animated.parallel([
        Animated.timing(imageScale, {
          toValue: 0.85,
          duration,
          easing: ANIMATION_CONFIG.easing.iosStandard,
          useNativeDriver: true,
        }),
        Animated.timing(imageTranslateY, {
          toValue: -30,
          duration,
          easing: ANIMATION_CONFIG.easing.iosStandard,
          useNativeDriver: true,
        }),
      ]).start();
    });

    const hideSubscription = Keyboard.addListener(keyboardHideEvent, (e) => {
      const duration = e?.duration ?? 300;
      setKeyboardHeight(0);
      setIsKeyboardOpen(false);
      // When on title step and user has entered a title, go to extra-data (details) screen
      setTimeout(() => {
        const currentTitle = (titleRef.current ?? '').trim();
        const currentStep = stepRef.current;
        if (currentStep === 'title' && currentTitle.length > 0) {
          setStep('details');
        }
        if (currentTitle.length === 0) {
          setShowTitleInput(false);
        }
      }, 0);
      // Animate image back: scale 1, translateY 0
      Animated.parallel([
        Animated.timing(imageScale, {
          toValue: 1,
          duration,
          easing: ANIMATION_CONFIG.easing.iosStandard,
          useNativeDriver: true,
        }),
        Animated.timing(imageTranslateY, {
          toValue: 0,
          duration,
          easing: ANIMATION_CONFIG.easing.iosStandard,
          useNativeDriver: true,
        }),
      ]).start();
    });

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, [title]);

  // --- Helpers ---
  const parseExifDate = (exifDate: string): string => {
    if (!exifDate) return new Date().toISOString();
    try {
      const [datePart, timePart] = exifDate.split(' ');
      const [year, month, day] = datePart.split(':');
      return new Date(`${year}-${month}-${day}T${timePart}`).toISOString();
    } catch (e) {
      return new Date().toISOString();
    }
  };

  const handleSave = async () => {
    if (selectedImages.length === 0) return;

    const firstImage = selectedImages[0];
    const timestamp = firstImage.exif?.DateTimeOriginal
      ? parseExifDate(firstImage.exif.DateTimeOriginal)
      : new Date().toISOString();

    const coords = getDecimalCoordinatesFromExif(firstImage.exif ?? undefined);
    const locationProps = coords != null ? { latitude: coords.latitude, longitude: coords.longitude } : {};
    const altitudeRaw = firstImage.exif?.GPSAltitude;
    const altitudeMetersFromExif =
      typeof altitudeRaw === 'number' && Number.isFinite(altitudeRaw) ? altitudeRaw : undefined;

    const matchingAlbumId = findMatchingAlbumId(timestamp, tripAlbums ?? []);

    const newEntry: Entry = {
      id: generateUUID(),
      type: 'experience',
      title: title.trim().length > 0 ? title : undefined,
      description: description,
      mediaType: 'photo',
      photoPaths: [],
      mediaPaths: [],
      storageUrls: [],
      timestamp: timestamp,
      ...locationProps,
      ...(matchingAlbumId ? { albumId: matchingAlbumId } : {}),
      season: getSeasonFromTimestamp(timestamp, coords?.latitude),
      ...(altitudeMetersFromExif != null ? { altitudeMeters: altitudeMetersFromExif } : {}),
      isAwe: isAweTagged,
      emotionLabels: emotionLabels.length > 0 ? emotionLabels : undefined,
      ...(emotionNote.trim() ? { emotionNote: emotionNote.trim().slice(0, 200) } : {}),
      isDraft: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    if (coords) {
      try {
        const weather = await getWeatherAtLocation(coords.latitude, coords.longitude);
        if (weather) {
          newEntry.weather = weather.condition;
          newEntry.temperatureCelsius = weather.temperatureCelsius;
        }
      } catch (_) {
        // Non-blocking; entry saves without weather
      }
    }

    try {
      const persistentUris = await copyMediaToPersistentStorage(
        selectedImages.map(img => img.uri),
        newEntry.id
      );
      newEntry.photoPaths = persistentUris;
      newEntry.mediaPaths = persistentUris;
    } catch (copyError) {
      logger.error('AddPastExperiences: copy to persistent storage failed', copyError);
      Alert.alert('Error', 'Could not save photos. Please try again.');
      return;
    }

    setUserSkippedTitle(false);
    try {
      const toSave = await attachCountryToEntryIfMissing(newEntry);
      await createEntry(toSave);
      try {
        record('first_past_memory');
      } catch (_) {
        // Non-blocking
      }
    } catch (_) {
      // createEntry failed; do not navigate
      return;
    }
    try {
      navigation.navigate('MainTabs', { screen: 'Home' });
    } catch (err) {
      logger.warn('AddPastExperiences: navigate to Home failed', err);
      navigation.goBack();
    }
  };

  const pickImages = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Denied', 'We need camera roll permissions.');
      return;
    }

    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: 'images',
        allowsMultipleSelection: true,
        selectionLimit: 3,
        quality: 1,
        exif: true,
      });

      if (!result.canceled) {
        const images: SelectedImage[] = result.assets.map(asset => ({
          uri: asset.uri,
          width: asset.width,
          height: asset.height,
          exif: asset.exif,
        }));

        const finalImages = images.length > 3 ? images.slice(0, 3) : images;
        if (images.length > 3) Alert.alert('Limit', 'Max 3 photos.');

        setSelectedImages(finalImages);
        setStep('details'); // Go directly to extra-details (title row + 4 buttons + Save)
      }
    } catch (error) {
      logger.error('Pick error:', error);
      Alert.alert('Error', 'Failed to pick images.');
    }
  };

  const handleDescriptionPress = () => {
    setShowDescriptionInput(true);
    setDescriptionText(description);
    descriptionBlurOpacity.setValue(0);
    descriptionContainerTranslateY.setValue(100);
    descriptionCloseButtonOpacity.setValue(0);
    descriptionSaveButtonOpacity.setValue(0);
    requestAnimationFrame(() => {
      Animated.parallel([
        Animated.timing(descriptionBlurOpacity, {
          toValue: 0.6,
          duration: 200,
          easing: ANIMATION_CONFIG.easing.easeOut,
          useNativeDriver: true,
        }),
        Animated.timing(descriptionContainerTranslateY, {
          toValue: 0,
          duration: 300,
          easing: ANIMATION_CONFIG.easing.easeOut,
          useNativeDriver: true,
        }),
        Animated.timing(descriptionCloseButtonOpacity, {
          toValue: 1,
          duration: 300,
          delay: 100,
          easing: ANIMATION_CONFIG.easing.easeOut,
          useNativeDriver: true,
        }),
        Animated.timing(descriptionSaveButtonOpacity, {
          toValue: 1,
          duration: 300,
          delay: 100,
          easing: ANIMATION_CONFIG.easing.easeOut,
          useNativeDriver: true,
        }),
      ]).start();
      setTimeout(() => descriptionInputRef.current?.focus(), 350);
    });
  };

  const handleDescriptionClose = () => {
    Keyboard.dismiss();
    Animated.parallel([
      Animated.timing(descriptionContainerTranslateY, {
        toValue: 100,
        duration: 300,
        easing: ANIMATION_CONFIG.easing.easeInOut,
        useNativeDriver: true,
      }),
      Animated.timing(descriptionBlurOpacity, {
        toValue: 0,
        duration: 200,
        delay: 100,
        easing: ANIMATION_CONFIG.easing.easeOut,
        useNativeDriver: true,
      }),
      Animated.timing(descriptionCloseButtonOpacity, { toValue: 0, duration: 200, useNativeDriver: true }),
      Animated.timing(descriptionSaveButtonOpacity, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start(() => {
      setShowDescriptionInput(false);
      setDescriptionText('');
      descriptionSaveButtonOpacity.setValue(0);
      descriptionContainerTranslateY.setValue(100);
      descriptionBlurOpacity.setValue(0);
      descriptionCloseButtonOpacity.setValue(0);
    });
  };

  const handleDescriptionSave = () => {
    if (descriptionText.trim().length === 0) return;
    setDescription(descriptionText.trim());
    Keyboard.dismiss();
    Animated.parallel([
      Animated.timing(descriptionContainerTranslateY, {
        toValue: 100,
        duration: 300,
        easing: ANIMATION_CONFIG.easing.easeInOut,
        useNativeDriver: true,
      }),
      Animated.timing(descriptionBlurOpacity, {
        toValue: 0,
        duration: 200,
        delay: 100,
        easing: ANIMATION_CONFIG.easing.easeOut,
        useNativeDriver: true,
      }),
      Animated.timing(descriptionCloseButtonOpacity, { toValue: 0, duration: 200, useNativeDriver: true }),
      Animated.timing(descriptionSaveButtonOpacity, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start(() => {
      setShowDescriptionInput(false);
      descriptionSaveButtonOpacity.setValue(0);
      descriptionContainerTranslateY.setValue(100);
      descriptionBlurOpacity.setValue(0);
      descriptionCloseButtonOpacity.setValue(0);
    });
  };

  const handleEmotionPress = () => {
    setShowEmotionPicker(true);
    emotionBlurOpacity.setValue(0);
    emotionContainerTranslateY.setValue(100);
    emotionCloseButtonOpacity.setValue(0);
    requestAnimationFrame(() => {
      Animated.parallel([
        Animated.timing(emotionBlurOpacity, {
          toValue: 0.6,
          duration: 200,
          easing: ANIMATION_CONFIG.easing.easeOut,
          useNativeDriver: true,
        }),
        Animated.timing(emotionContainerTranslateY, {
          toValue: 0,
          duration: 300,
          easing: ANIMATION_CONFIG.easing.easeOut,
          useNativeDriver: true,
        }),
        Animated.timing(emotionCloseButtonOpacity, {
          toValue: 1,
          duration: 300,
          delay: 100,
          easing: ANIMATION_CONFIG.easing.easeOut,
          useNativeDriver: true,
        }),
      ]).start();
    });
  };

  const handleEmotionClose = () => {
    Animated.parallel([
      Animated.timing(emotionContainerTranslateY, {
        toValue: 100,
        duration: 300,
        easing: ANIMATION_CONFIG.easing.easeInOut,
        useNativeDriver: true,
      }),
      Animated.timing(emotionBlurOpacity, {
        toValue: 0,
        duration: 200,
        delay: 100,
        easing: ANIMATION_CONFIG.easing.easeOut,
        useNativeDriver: true,
      }),
      Animated.timing(emotionCloseButtonOpacity, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start(() => {
      setShowEmotionPicker(false);
      emotionContainerTranslateY.setValue(100);
      emotionBlurOpacity.setValue(0);
      emotionCloseButtonOpacity.setValue(0);
    });
  };

  const handleEmotionSave = (labels: string[], note?: string) => {
    setEmotionLabels(labels);
    setEmotionNote(note ?? '');
    handleEmotionClose();
  };

  const handleBack = () => {
    if (showDescriptionInput) { handleDescriptionClose(); return; }
    if (showEmotionPicker) { handleEmotionClose(); return; }

    const confirmGoBack = (action: () => void) => {
      Alert.alert(
        'Discard changes?',
        'Are you sure you want to go back?',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Yes',
            onPress: () => {
              try {
                action();
              } catch (e) {
                logger.warn('AddPastExperiencesScreen: handleBack action failed', e);
              }
            },
          },
        ]
      );
    };

    if (step === 'details') {
      confirmGoBack(() => {
        setStep('selection');
        setSelectedImages([]);
        setTitle('');
        setDescription('');
        setDescriptionText('');
        setEmotionLabels([]);
        setIsAweTagged(false);
        setUserSkippedTitle(false);
        setShowTitleInput(false);
      });
    } else if (step === 'title') {
      confirmGoBack(() => {
        Keyboard.dismiss();
        setShowTitleInput(false);
        setUserSkippedTitle(false);
        setStep('selection');
        setSelectedImages([]);
      });
    } else {
      navigation.goBack();
    }
  };

  // --- Renderers ---

  const renderPagination = () => {
    if (selectedImages.length <= 1) return null;
    return (
      <View style={styles.paginationContainer}>
        {selectedImages.map((_, index) => (
          <View
            key={index}
            style={[
              styles.paginationDot,
              index === activeSlide ? styles.paginationDotActive : styles.paginationDotInactive,
            ]}
          />
        ))}
      </View>
    );
  };

  const renderCarousel = (isDetailsStep: boolean, dimensions?: { width: number; height: number }) => {
    const width = dimensions?.width ?? 344 * scaleFactor;
    const height = dimensions?.height ?? 463 * scaleFactor;

    return (
      <View style={[styles.carouselContainer, { width, height }]}>
        <FlatList
          data={selectedImages}
          renderItem={({ item }) => (
            <Image
              source={{ uri: item.uri }}
              style={{ width, height, borderRadius: 24 }}
              resizeMode="cover"
            />
          )}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onViewableItemsChanged={onViewRef.current}
          viewabilityConfig={viewConfigRef.current}
          keyExtractor={(item) => item.uri}
        />
        {renderPagination()}
      </View>
    );
  };

  // STEP 1: Selection
  if (step === 'selection') {
    return (
      <View style={styles.container}>
        <MeshGradientBackground baseColor={colors.background} lightMode={!isDark} />
        <TouchableOpacity style={styles.backButton} onPress={handleBack} activeOpacity={0.7}>
          <BackArrow width={19} height={21} color={colors.textPrimary} />
        </TouchableOpacity>

        <View style={styles.emptyStateContent}>
          <Ionicons name="image-outline" size={80} color={colors.textPrimary} style={{ marginBottom: 24 }} />
          <Text style={styles.emptyTitle}>Add Memories From Past Adventures</Text>
          <TouchableOpacity style={styles.selectButton} onPress={pickImages} activeOpacity={0.8}>
            <Text style={styles.selectButtonText}>Tap To Select Photos</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // STEP 2: Title & Awe (No Save) – absolute layout matching CaptureScreen
  if (step === 'title') {
    const hasTitle = title.trim().length > 0;
    const focusTitleInput = () => {
      setShowTitleInput(true);
      setTimeout(() => {
        try {
          titleInputRef.current?.focus();
        } catch (err) {
          logger.warn('AddPastExperiencesScreen: could not focus title input', err);
        }
      }, 100);
    };

    return (
      <View style={styles.container}>
        <MeshGradientBackground baseColor={colors.background} lightMode={!isDark} />
        <TouchableOpacity
          style={[styles.backButton, styles.backButtonTitleStep, {
            top: insets.top + 60 * scaleFactor,
            left: 18 * scaleFactor,
            width: 23.75 * scaleFactor,
            height: 26.25 * scaleFactor,
          }]}
          onPress={handleBack}
          activeOpacity={0.7}
        >
          <BackArrow width={23.75 * scaleFactor} height={26.25 * scaleFactor} color={colors.textPrimary} />
        </TouchableOpacity>

        <View style={[styles.titleStepContentContainer, {
          top: containerTop,
          height: Math.max(0, currentPositions.containerHeight - containerBottomInset),
        }]}>
          {/* Carousel (image) – absolute position + animation when keyboard open */}
          <Animated.View
            style={[styles.titleStepCarouselWrapper, {
              top: currentPositions.imageTop,
              left: currentPositions.imageLeft,
              width: currentPositions.imageWidth,
              height: currentPositions.imageHeight,
              transform: [
                { scale: imageScale },
                { translateY: imageTranslateY },
              ],
            }]}
          >
            {renderCarousel(false, {
              width: currentPositions.imageWidth,
              height: currentPositions.imageHeight,
            })}
          </Animated.View>

          {/* Image tap area – dismiss keyboard when keyboard open */}
          {showTitleInput && isKeyboardOpen && (
            <TouchableOpacity
              style={[styles.imageTapArea, {
                top: currentPositions.imageTop,
                left: currentPositions.imageLeft,
                width: currentPositions.imageWidth,
                height: currentPositions.imageHeight,
              }]}
              activeOpacity={1}
              onPress={() => {
                Keyboard.dismiss();
                titleInputRef.current?.blur();
              }}
            />
          )}

          {/* Title prompt "Add a title..." */}
          {!showTitleInput && !hasTitle && !userSkippedTitle && (
            <TouchableOpacity
              style={[styles.titlePromptContainerAbsolute, {
                top: positionsClosed.titleTextTop,
                left: positionsClosed.titleTextLeft,
                width: positionsClosed.titleTextWidth,
              }]}
              onPress={focusTitleInput}
              activeOpacity={0.7}
            >
              <Text style={[styles.titlePromptText, { fontSize: 20 * scaleFactor }]}>Add a title...</Text>
            </TouchableOpacity>
          )}

          {/* Tappable title (existing title) – show when has title and (not input mode or keyboard closed) */}
          {hasTitle && (!showTitleInput || !isKeyboardOpen) && (
            <TouchableOpacity
              style={[styles.titlePromptContainerAbsolute, {
                top: positionsClosed.titleTextTop,
                left: positionsClosed.titleTextLeft,
                width: positionsClosed.titleTextWidth,
              }]}
              onPress={focusTitleInput}
              activeOpacity={0.7}
            >
              {isAweTagged ? (
                <GradientText style={[styles.titlePromptText, { fontSize: 20 * scaleFactor }]}>{title}</GradientText>
              ) : (
                <Text style={[styles.titlePromptText, { fontSize: 20 * scaleFactor }]}>{title}</Text>
              )}
            </TouchableOpacity>
          )}

          {/* Title TextInput – position above image when keyboard open */}
          {showTitleInput && (isKeyboardOpen || !hasTitle) && (
            <TextInput
              ref={titleInputRef}
              value={title}
              onChangeText={setTitle}
              placeholder="Add a title..."
              placeholderTextColor={colors.borderLight}
              style={[styles.titleInputAbsolute, {
                fontSize: 20 * scaleFactor,
                top: isKeyboardOpen ? (currentPositions as { titleInputTop: number }).titleInputTop : positionsClosed.titleTextTop,
                left: isKeyboardOpen ? (currentPositions as { titleInputLeft: number }).titleInputLeft : positionsClosed.titleTextLeft,
                width: isKeyboardOpen ? (currentPositions as { titleInputWidth: number }).titleInputWidth : positionsClosed.titleTextWidth,
              }]}
              autoCorrect={false}
              autoCapitalize="none"
              blurOnSubmit
              returnKeyType="done"
              multiline={false}
              textAlign="center"
              onSubmitEditing={() => {
                Keyboard.dismiss();
              }}
            />
          )}

          {/* Bookmark – absolute position (match CaptureScreen) */}
          {!hasTitle && !userSkippedTitle && (
            <TouchableOpacity
              style={[styles.aweTagButtonTitleStep, {
                top: positionsClosed.titleTextTop + 44 * scaleFactor,
                left: (windowWidth - 160 * scaleFactor) / 2,
                width: 160 * scaleFactor,
                height: 40 * scaleFactor,
                borderRadius: 20 * scaleFactor,
                borderColor: isAweTagged ? COLORS.babyBlue : colors.borderLight,
              }]}
              onPress={() => setIsAweTagged((prev) => !prev)}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Toggle bookmark"
            >
              {isAweTagged ? (
                <>
                  <LinearGradient
                    colors={[COLORS.babyBlue, COLORS.royalGold, COLORS.fern]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={[StyleSheet.absoluteFillObject, { borderRadius: 20 * scaleFactor }]}
                  />
                  <View style={styles.aweTagButtonContent}>
                    <CompassIcon width={18 * scaleFactor} height={18 * scaleFactor} color={colors.textPrimary} />
                    <Text style={[styles.aweTagButtonTextTitleStep, { fontSize: 15 * scaleFactor, color: colors.textPrimary }]}>Bookmark</Text>
                  </View>
                </>
              ) : (
                <View style={styles.aweTagButtonContent}>
                  <CompassIcon width={18 * scaleFactor} height={18 * scaleFactor} color={colors.textPrimary} />
                  <Text style={[styles.aweTagButtonTextTitleStep, { fontSize: 15 * scaleFactor, color: colors.textPrimary }]}>Bookmark</Text>
                </View>
              )}
            </TouchableOpacity>
          )}

          {/* Skip – absolute position (match CaptureScreen) */}
          {!hasTitle && !userSkippedTitle && (
            <TouchableOpacity
              style={[styles.skipTouchableAbsolute, {
                top: positionsClosed.titleTextTop + 44 * scaleFactor + 40 * scaleFactor + 6 + windowHeight * 0.04,
                left: (windowWidth - 60) / 2,
              }]}
              onPress={() => {
                setUserSkippedTitle(true);
                setStep('details');
              }}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Skip to details without title"
            >
              <Text style={styles.skipText}>Skip</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  }

  // STEP 3: Details (Desc, Emotion, Save)
  // Overlay container height uses available height when keyboard closed so content adapts to device
  const detailsOverlayContainerHeight = isKeyboardOpen
    ? windowHeight - keyboardHeight - containerTop
    : availableHeight;
  const detailsOverlayWrapperStyle = {
    position: 'absolute' as const,
    top: containerTop,
    left: 0,
    right: 0,
    height: detailsOverlayContainerHeight,
    zIndex: 1000,
  };

  const emotionOverlayFullScreenStyle = {
    position: 'absolute' as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 1000,
  };

  return (
    <View style={styles.container}>
      <MeshGradientBackground baseColor={colors.background} lightMode={!isDark} />
      <TouchableOpacity style={styles.backButton} onPress={handleBack} activeOpacity={0.7}>
        <BackArrow width={19} height={21} color={colors.textPrimary} />
      </TouchableOpacity>

      {/* Details content container - ScrollView so SAVE stays reachable on small devices */}
      <View style={[styles.detailsContentContainer, { top: containerTop, height: Math.max(0, availableHeight) }]}>
        {/* Carousel - same position/size as CaptureScreen Screen 3 image (0.85 scale, centered) */}
        <View
          style={{
            position: 'absolute',
            left: (windowWidth - positionsClosed.imageWidth * imageScaleExtraData) / 2,
            top: positionsClosed.imageTop,
            width: positionsClosed.imageWidth * imageScaleExtraData,
            height: positionsClosed.imageHeight * imageScaleExtraData,
          }}
        >
          {renderCarousel(true, {
            width: positionsClosed.imageWidth * imageScaleExtraData,
            height: positionsClosed.imageHeight * imageScaleExtraData,
          })}
        </View>

        <ScrollView
          style={{
            position: 'absolute',
            top: imageBottomDetails,
            left: 0,
            right: 0,
            bottom: 0,
          }}
          contentContainerStyle={{
            paddingHorizontal: 25 * scaleFactor,
            paddingRight: 24 * scaleFactor,
            paddingBottom: containerBottomInset + (containerBottomInset > 0 ? BOTTOM_SAFE_BUFFER : 8),
            flexGrow: 1,
          }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          bounces={false}
        >
          {/* Title — "Add A Title..." or title (Figma: below image) */}
          <TouchableOpacity
            style={[styles.detailsTitleTouchable, { position: 'relative', marginTop: SPACING.md }]}
            onPress={() => { setUserSkippedTitle(false); setStep('title'); }}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={title ? 'Edit title' : 'Add a title'}
          >
            {isAweTagged ? (
              <GradientText style={[styles.detailsTitleText, { fontSize: 20 * scaleFactor }]}>
                {title || 'Add A Title...'}
              </GradientText>
            ) : (
              <Text style={[styles.detailsTitleText, { fontSize: 20 * scaleFactor, color: title ? colors.textPrimary : colors.textSecondary }]}>
                {title || 'Add A Title...'}
              </Text>
            )}
          </TouchableOpacity>

          {/* "Add more details:" — Figma layout */}
          <Text
            style={[styles.detailsAddMoreText, {
              position: 'relative',
              marginTop: SPACING.md,
              fontSize: 12 * scaleFactor,
            }]}
          >
            Add more details:
          </Text>

          {/* Two rows: Row 1 Description + Emotion; Row 2 Bookmark centered */}
          <View
            style={[styles.detailsControlsRow, {
              marginTop: SPACING.sm,
              alignSelf: 'center',
              width: positionsClosed.imageWidth,
              position: 'relative',
              left: undefined,
              top: undefined,
              flexDirection: 'column',
              alignItems: 'center',
              gap: 10 * scaleFactor,
            }]}
          >
            <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8 * scaleFactor }}>
              <TouchableOpacity
                style={[styles.actionButton, {
                  borderRadius: 22 * scaleFactor,
                  height: 36 * scaleFactor,
                  paddingHorizontal: 12 * scaleFactor,
                  minWidth: 86 * scaleFactor,
                  gap: 4 * scaleFactor,
                }]}
                onPress={handleDescriptionPress}
                activeOpacity={0.7}
              >
                <PenIcon width={13 * scaleFactor} height={13 * scaleFactor} color={colors.textPrimary} />
                <Text style={[styles.actionButtonText, { fontSize: 13 * scaleFactor }]}>Description</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionButton, {
                  borderRadius: 22 * scaleFactor,
                  height: 36 * scaleFactor,
                  paddingHorizontal: 12 * scaleFactor,
                  minWidth: 76 * scaleFactor,
                  gap: 4 * scaleFactor,
                }]}
                onPress={handleEmotionPress}
                activeOpacity={0.7}
              >
                <HeartIcon width={13 * scaleFactor} height={13 * scaleFactor} color={colors.textPrimary} />
                <Text style={[styles.actionButtonText, { fontSize: 13 * scaleFactor }]}>Emotion</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              style={[styles.actionButton, {
                borderRadius: 22 * scaleFactor,
                height: 36 * scaleFactor,
                paddingHorizontal: 12 * scaleFactor,
                minWidth: 86 * scaleFactor,
                gap: 4 * scaleFactor,
                borderColor: isAweTagged ? COLORS.babyBlue : colors.textPrimary,
                overflow: 'hidden',
              }]}
              onPress={() => setIsAweTagged(!isAweTagged)}
              activeOpacity={0.7}
            >
              {isAweTagged ? (
                <>
                  <LinearGradient
                    colors={[COLORS.babyBlue, COLORS.royalGold, COLORS.fern]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={[StyleSheet.absoluteFillObject, { borderRadius: 22 * scaleFactor }]}
                  />
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 * scaleFactor }}>
                    <CompassIcon width={13 * scaleFactor} height={13 * scaleFactor} color={colors.textPrimary} />
                    <Text style={[styles.actionButtonText, { fontSize: 13 * scaleFactor }]}>Bookmark</Text>
                  </View>
                </>
              ) : (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 * scaleFactor }}>
                  <CompassIcon width={13 * scaleFactor} height={13 * scaleFactor} color={colors.textPrimary} />
                  <Text style={[styles.actionButtonText, { fontSize: 13 * scaleFactor }]}>Bookmark</Text>
                </View>
              )}
            </TouchableOpacity>
          </View>

          {/* SAVE — below two rows of buttons */}
          <TouchableOpacity
            style={[styles.detailsSaveButton, {
              position: 'relative',
              marginTop: SPACING.md,
              alignSelf: 'center',
              width: windowWidth - 49 * scaleFactor,
            }]}
            onPress={handleSave}
            activeOpacity={0.7}
          >
            <GradientText style={[styles.saveButtonText, { fontSize: 25 * scaleFactor }]}>SAVE</GradientText>
          </TouchableOpacity>
        </ScrollView>
      </View>

      {/* Description overlay - same height/position/constraints as CaptureScreen */}
      {showDescriptionInput && (
        <View style={detailsOverlayWrapperStyle}>
          <Animated.View
            style={[styles.descriptionBlurOverlay, { opacity: descriptionBlurOpacity }]}
          >
            <TouchableOpacity style={styles.blurTouchable} activeOpacity={1} onPress={handleDescriptionClose} />
          </Animated.View>
          <Animated.View
            style={[styles.descriptionContainer, {
              transform: [{ translateY: descriptionContainerTranslateY }],
              height: '100%',
              paddingTop: Math.max(28, Math.round(0.06 * windowHeight) - SPACING.sm),
              paddingBottom: containerBottomInset + 20,
            }]}
          >
            <Animated.View style={{ opacity: descriptionCloseButtonOpacity }}>
              <TouchableOpacity style={styles.descriptionCloseButton} onPress={handleDescriptionClose} activeOpacity={0.7}>
                <Text style={styles.descriptionCloseText}>×</Text>
              </TouchableOpacity>
            </Animated.View>
            <View style={styles.descriptionTextInputWrapper}>
              <TextInput
                ref={descriptionInputRef}
                style={styles.descriptionTextInput}
                placeholder="Write A Description..."
                placeholderTextColor={colors.textSecondary}
                value={descriptionText}
                onChangeText={setDescriptionText}
                multiline
                autoFocus={false}
                returnKeyType="done"
                maxLength={500}
                textAlignVertical="top"
              />
            </View>
            <Animated.View style={{ opacity: descriptionSaveButtonOpacity }}>
              <TouchableOpacity
                style={[styles.descriptionSaveButton, { bottom: isKeyboardOpen ? 50 : containerBottomInset + BOTTOM_SAFE_BUFFER }]}
                onPress={handleDescriptionSave}
                disabled={descriptionText.trim().length === 0}
                activeOpacity={0.7}
              >
                <Text style={styles.descriptionSaveButtonText}>Save</Text>
              </TouchableOpacity>
            </Animated.View>
          </Animated.View>
        </View>
      )}

      {/* Emotion overlay - full screen (extends into status bar to remove top gap) */}
      {showEmotionPicker && (
        <View style={[emotionOverlayFullScreenStyle, { top: -(Number.isFinite(insets.top) ? insets.top : 0) }]}>
          <Animated.View style={[styles.emotionBlurOverlay, { opacity: emotionBlurOpacity }]}>
            <TouchableOpacity style={styles.blurTouchable} activeOpacity={1} onPress={handleEmotionClose} />
          </Animated.View>
          <Animated.View
            style={[styles.emotionContainer, {
              transform: [{ translateY: emotionContainerTranslateY }],
              paddingTop: insets.top + 48,
            }]}
          >
            <Animated.View style={[styles.emotionCloseButtonWrapper, { top: insets.top + 20 }]}>
              <TouchableOpacity style={styles.emotionCloseButton} onPress={handleEmotionClose} activeOpacity={0.7}>
                <Text style={styles.emotionCloseText}>×</Text>
              </TouchableOpacity>
            </Animated.View>
            <EmotionalCaptureFlow
              initialLabels={emotionLabels}
              initialEmotionNote={emotionNote}
              onClose={handleEmotionClose}
              onSave={handleEmotionSave}
              bottomInset={containerBottomInset}
            />
          </Animated.View>
        </View>
      )}
    </View>
  );
};

function createAddPastStyles(colors: ThemeColors) {
  return StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  backButton: {
    position: 'absolute',
    top: 60,
    left: 25,
    zIndex: 10,
    padding: 8,
  },
  backButtonTitleStep: {
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 100,
  },
  titleStepContentContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 1,
  },
  titleStepCarouselWrapper: {
    position: 'absolute',
    overflow: 'hidden',
    borderRadius: 24,
  },
  imageTapArea: {
    position: 'absolute',
    backgroundColor: 'transparent',
    zIndex: 5,
  },
  titlePromptContainerAbsolute: {
    position: 'absolute',
    justifyContent: 'center',
    alignItems: 'center',
  },
  titleInputAbsolute: {
    position: 'absolute',
    fontFamily: FONTS.inter,
    fontWeight: FONT_WEIGHTS.semibold,
    color: colors.borderLight,
    textAlign: 'center',
    backgroundColor: 'transparent',
    paddingVertical: 0,
    paddingHorizontal: 0,
  },
  aweTagButtonTitleStep: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    paddingHorizontal: 18,
    overflow: 'hidden',
  },
  aweTagButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: 'transparent',
  },
  aweTagButtonTextTitleStep: {
    fontFamily: FONTS.inter,
    fontWeight: FONT_WEIGHTS.bold,
  },
  skipTouchableAbsolute: {
    position: 'absolute',
    paddingVertical: 4,
    paddingHorizontal: 8,
    zIndex: 5,
  },
  emptyStateContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  emptyTitle: {
    fontFamily: FONTS.playfairDisplay,
    fontStyle: 'italic',
    fontSize: 22,
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: 40,
    maxWidth: 300,
  },
  selectButton: {
    backgroundColor: colors.surface,
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 30,
    width: '100%',
    maxWidth: 280,
    alignItems: 'center',
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    elevation: 5,
  },
  selectButtonText: {
    fontFamily: FONTS.inter,
    fontWeight: '600',
    fontSize: 16,
    color: colors.textPrimary,
  },
  editorContent: {
    flex: 1,
    alignItems: 'center',
    paddingTop: 80,
  },
  detailsContentContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 1,
  },
  detailsTitleTouchable: {
    position: 'absolute',
    justifyContent: 'center',
    alignItems: 'center',
  },
  detailsTitleText: {
    fontFamily: FONTS.inter,
    fontWeight: FONT_WEIGHTS.semibold,
    textAlign: 'center',
    width: '100%',
  },
  detailsAddMoreText: {
    position: 'absolute',
    fontFamily: FONTS.inter,
    fontWeight: FONT_WEIGHTS.regular,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  detailsControlsRow: {
    position: 'absolute',
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  detailsBookmarkIconWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailsSaveButton: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 10,
  },
  carouselContainer: {
    // Dynamic W/H set inline
    borderRadius: 24,
    // overflow: 'hidden', // Disabled to let Aura bleed
    marginBottom: 20,
  },

  paginationContainer: {
    position: 'absolute',
    bottom: 10,
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  paginationDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginHorizontal: 4,
  },
  paginationDotActive: {
    backgroundColor: colors.surface,
  },
  paginationDotInactive: {
    backgroundColor: 'rgba(255,255,255,0.4)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  // Step 2 Styles
  titlePromptContainer: {
    marginBottom: 20,
    paddingVertical: 8,
    width: '80%',
  },
  titlePromptText: {
    fontFamily: FONTS.inter,
    fontWeight: FONT_WEIGHTS.semibold,
    color: colors.borderLight,
    textAlign: 'center',
  },
  titleInput: {
    fontFamily: FONTS.inter,
    fontWeight: FONT_WEIGHTS.semibold,
    color: colors.borderLight,
    marginBottom: 20,
    width: '80%',
    borderBottomWidth: 1,
    borderBottomColor: colors.textSecondary,
    paddingBottom: 8,
  },
  skipTouchable: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    marginTop: 6,
    alignSelf: 'center',
  },
  skipText: {
    fontFamily: FONTS.inter,
    fontSize: 13,
    color: colors.infoTextGray,
  },
  aweButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 100,
    borderWidth: 1,
    borderColor: colors.borderLight,
    gap: 8,
  },
  aweButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 100,
  },
  aweButtonInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 100,
    backgroundColor: 'transparent',
  },
  aweButtonActive: {
    borderColor: COLORS.babyBlue,
  },
  aweButtonText: {
    fontFamily: FONTS.inter,
    fontSize: 14,
    color: colors.textPrimary,
    fontWeight: '600',
  },
  // Step 3 Styles
  staticTitle: {
    fontFamily: FONTS.playfairDisplay, // Assuming font
    fontSize: 24,
    color: colors.textPrimary,
    textAlign: 'center',
    marginTop: 0,
    marginBottom: 10,
  },
  addMoreText: {
    fontFamily: FONTS.inter,
    fontSize: 12,
    color: colors.textSecondary,
    marginBottom: 15,
  },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 30,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: colors.textPrimary,
  },
  actionButtonText: {
    color: colors.textPrimary,
    fontFamily: FONTS.inter,
    fontWeight: FONT_WEIGHTS.bold,
  },
  detailsButtonsRow2: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
  },
  smallAweButton: {
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  smallAweButtonGradient: {
    width: '100%',
    height: '100%',
    borderRadius: 19,
    justifyContent: 'center',
    alignItems: 'center',
  },
  smallAweButtonInner: {
    width: '100%',
    height: '100%',
    borderRadius: 19,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  smallAweButtonActive: {
    borderColor: COLORS.babyBlue,
  },
  saveButton: {
    position: 'absolute',
    bottom: 40,
    width: '100%',
    alignItems: 'center',
  },
  saveButtonText: {
    fontFamily: FONTS.inter,
    fontWeight: FONT_WEIGHTS.black,
    textAlign: 'center',
  },
  // Overlays
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 100,
  },
  overlayContent: {
    width: '85%',
    backgroundColor: colors.surface,
    padding: 24,
    borderRadius: 16,
    alignItems: 'center',
  },
  overlayTitle: {
    color: colors.textPrimary,
    fontSize: 18,
    marginBottom: 16,
    fontFamily: FONTS.inter,
    fontWeight: '600',
  },
  overlayInput: {
    color: colors.textPrimary,
    width: '100%',
    minHeight: 100,
    backgroundColor: colors.background,
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    textAlignVertical: 'top',
  },
  overlayClose: {
    padding: 12,
  },
  overlayCloseText: {
    color: COLORS.babyBlue,
    fontSize: 16,
    fontWeight: '600',
  },
  descriptionBlurOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.background,
    zIndex: 1000,
  },
  blurTouchable: {
    flex: 1,
  },
  descriptionContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.surface,
    borderTopLeftRadius: 35,
    borderTopRightRadius: 35,
    paddingHorizontal: 25,
    paddingBottom: 20,
    zIndex: 1001,
  },
  descriptionCloseButton: {
    position: 'absolute',
    top: -40,
    right: 16,
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1002,
  },
  descriptionCloseText: {
    fontSize: 32,
    color: colors.textPrimary,
    fontWeight: FONT_WEIGHTS.bold,
  },
  descriptionTextInputWrapper: {
    flex: 1,
    marginTop: 24,
    marginBottom: 110,
  },
  descriptionTextInput: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: 16,
    fontFamily: FONTS.inter,
    fontWeight: FONT_WEIGHTS.semibold,
    textAlignVertical: 'top',
    padding: 0,
  },
  descriptionSaveButton: {
    position: 'absolute',
    bottom: 80,
    right: 16,
    backgroundColor: colors.surface,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    minWidth: 60,
    alignItems: 'center',
  },
  descriptionSaveButtonText: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: FONT_WEIGHTS.semibold,
    fontFamily: FONTS.inter,
  },
  emotionBlurOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.background,
    zIndex: 1000,
  },
  emotionContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.surface,
    paddingHorizontal: 16,
    paddingBottom: 20,
    zIndex: 1001,
  },
  emotionCloseButtonWrapper: {
    position: 'absolute',
    right: 16,
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1002,
  },
  emotionCloseButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emotionCloseText: {
    fontSize: 32,
    color: colors.textPrimary,
    fontWeight: FONT_WEIGHTS.bold,
  },
  emotionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    justifyContent: 'center',
    marginBottom: 20,
  },
  emotionChip: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.textSecondary,
  },
  emotionChipActive: {
    backgroundColor: colors.surface,
    borderColor: colors.borderLight,
  },
  emotionText: {
    color: colors.textPrimary,
    fontSize: 14,
  },
  });
}

export default AddPastExperiencesScreen;
