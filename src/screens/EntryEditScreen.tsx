// EntryEditScreen
// Edit entry extra data - same UI as create flow (CaptureScreen / Add Past details step):
// absolute layout, blur+sheet for Description and Emotion, GradientText SAVE, back confirmation.

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Animated,
  Dimensions,
  Keyboard,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp, useIsFocused } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { useAppContext } from '../context/AppContext';
import { COLORS, DIMENSIONS, SPACING, FONTS, FONT_WEIGHTS } from '../config/constants';
import { logger } from '../utils/logger';
import { useTheme } from '../context/ThemeContext';
import { EntryPhotoImage } from '../components/common/EntryPhotoImage';
import { Entry } from '../models/Entry';
import { attachCountryToEntryIfMissing } from '../utils/entryCountryResolve';
import BackArrow from '../components/common/icons/BackArrow';
import PenIcon from '../components/common/icons/PenIcon';
import HeartIcon from '../components/common/icons/HeartIcon';
import CompassIcon from '../components/common/icons/CompassIcon';
import { LinearGradient } from 'expo-linear-gradient';
import { MeshGradientBackground } from '../components/common/MeshGradientBackground';
import GradientText from '../components/common/GradientText';
import EmotionalCaptureFlow from '../components/capture/EmotionalCaptureFlow';
import { ANIMATION_CONFIG } from '../utils/animations';

type EntryEditNavigationProp = NativeStackNavigationProp<RootStackParamList, 'EntryEdit'>;
type EntryEditRouteProp = RouteProp<RootStackParamList, 'EntryEdit'>;

const EntryEditScreen: React.FC = () => {
  const navigation = useNavigation<EntryEditNavigationProp>();
  const route = useRoute<EntryEditRouteProp>();
  const { colors, isDark } = useTheme();
  const { entryId } = route.params;
  const focusField = route.params?.focusField;
  const {
    entries,
    tripAlbums,
    updateEntry,
    pendingEmotionLabels,
    setPendingEmotionLabels,
    pendingEmotionNote,
    setPendingEmotionNote,
  } = useAppContext();

  const entry = entries.find(e => e.id === entryId);
  const insets = useSafeAreaInsets();
  const { width: screenWidth, height: windowHeight } = useWindowDimensions();
  const scaleFactor = screenWidth / 390;
  const containerTop = insets.top + 74 * scaleFactor;
  const screenHeight = windowHeight;
  const containerBottomInset = insets.bottom;
  const isFocused = useIsFocused();
  const hasHandledInitialFocusRef = useRef(false);

  // Same position formula as CaptureScreen/AddPastExperiencesScreen: image bottom → title → "Add more details:" → buttons → SAVE.
  const positionsClosed = useMemo(() => {
    const imageWidth = 344 * scaleFactor;
    const imageHeight = 463.033 * scaleFactor;
    const imageTop = 107.07 * scaleFactor - containerTop;
    const imageScaleExtraData = 0.85;
    const imageBottomEdit = imageTop + imageHeight * imageScaleExtraData;
    const titleOffsetDown = Number.isFinite(screenHeight) ? screenHeight * 0.05 : 0;
    const bottomSafeInset = Number.isFinite(DIMENSIONS.extraDataBottomSafeInset)
      ? DIMENSIONS.extraDataBottomSafeInset
      : 28;
    const detailsTitleTop = imageBottomEdit + SPACING.md + titleOffsetDown - bottomSafeInset;
    const detailsAddMoreTop = detailsTitleTop + 28 * scaleFactor + SPACING.xs;
    const detailsButtonsTop = detailsAddMoreTop + 14 * scaleFactor + SPACING.sm;
    const buttonRowHeight = 36 * scaleFactor;
    const buttonRowGap = 10 * scaleFactor;
    const detailsSaveTop = detailsButtonsTop + buttonRowHeight + buttonRowGap + buttonRowHeight + SPACING.xl;
    const saveButtonHeight = 48 * scaleFactor;
    const containerHeight = Math.max(
      800 * scaleFactor,
      Number.isFinite(detailsSaveTop) ? detailsSaveTop + saveButtonHeight + SPACING.md : 800 * scaleFactor,
    );
    return {
      imageWidth,
      imageHeight,
      imageTop,
      imageLeft: 25 * scaleFactor,
      titleTextLeft: 25 * scaleFactor,
      titleTextWidth: screenWidth - 49 * scaleFactor,
      containerHeight,
      detailsTitleTop,
      detailsAddMoreTop,
      detailsButtonsTop,
      detailsSaveTop,
    };
  }, [scaleFactor, containerTop, screenHeight]);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [emotionLabels, setEmotionLabels] = useState<string[]>([]);
  const [emotionNote, setEmotionNote] = useState<string>('');
  const [isAweTagged, setIsAweTagged] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const [showDescriptionInput, setShowDescriptionInput] = useState(false);
  const [descriptionText, setDescriptionText] = useState('');
  const [showEmotionPicker, setShowEmotionPicker] = useState(false);
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [isTitleFocused, setIsTitleFocused] = useState(false);

  const getPositionsOpen = useCallback(() => {
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
      titleInputLeft: (screenWidth - 258 * scaleFactor) / 2,
      titleInputWidth: 258 * scaleFactor,
      containerHeight: keyboardTopRelative,
    };
  }, [keyboardHeight, screenHeight, scaleFactor, containerTop]);

  const isTitleEditing = isTitleFocused && isKeyboardOpen;
  const currentPositions = useMemo(() => {
    return isTitleEditing ? getPositionsOpen() : positionsClosed;
  }, [isTitleEditing, getPositionsOpen, positionsClosed]);

  const descriptionInputRef = useRef<TextInput>(null);
  const titleInputRef = useRef<TextInput>(null);
  const keyboardDurationRef = useRef(300);
  const imageScale = useRef(new Animated.Value(1)).current;
  const imageTranslateY = useRef(new Animated.Value(0)).current;
  const descriptionBlurOpacity = useRef(new Animated.Value(0)).current;
  const descriptionContainerTranslateY = useRef(new Animated.Value(100)).current;
  const descriptionCloseButtonOpacity = useRef(new Animated.Value(0)).current;
  const descriptionSaveButtonOpacity = useRef(new Animated.Value(0)).current;
  const emotionBlurOpacity = useRef(new Animated.Value(0)).current;
  const emotionContainerTranslateY = useRef(new Animated.Value(100)).current;
  const emotionCloseButtonOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (entry) {
      setTitle(entry.title || '');
      setDescription(entry.description || '');
      setEmotionLabels(entry.emotionLabels || []);
      setEmotionNote(entry.emotionNote ?? '');
      setIsAweTagged(entry.isAwe ?? false);
    }
  }, [entry]);

  // Reset one-time focus-field handling when editing a different entry.
  useEffect(() => {
    hasHandledInitialFocusRef.current = false;
  }, [entryId]);

  // Apply pending emotion values returned from EmotionCaptureScreen when this screen regains focus
  useEffect(() => {
    if (!isFocused) {
      return;
    }

    if (pendingEmotionLabels !== null) {
      setEmotionLabels(pendingEmotionLabels);
      setPendingEmotionLabels(null);
    }

    if (pendingEmotionNote !== null) {
      setEmotionNote(pendingEmotionNote);
      setPendingEmotionNote(null);
    }
  }, [
    isFocused,
    pendingEmotionLabels,
    pendingEmotionNote,
    setEmotionLabels,
    setEmotionNote,
    setPendingEmotionLabels,
    setPendingEmotionNote,
  ]);

  // Auto-focus requested field when coming from Studio
  useEffect(() => {
    if (!entry || !focusField || hasHandledInitialFocusRef.current) return;
    hasHandledInitialFocusRef.current = true;

    // Small delay to ensure layout is complete
    const timer = setTimeout(() => {
      if (focusField === 'title') {
        titleInputRef.current?.focus();
      } else if (focusField === 'description') {
        handleDescriptionPress();
        // Focus textarea after sheet animation
        requestAnimationFrame(() => {
          descriptionInputRef.current?.focus();
        });
      } else if (focusField === 'emotion') {
        // Navigate to emotion capture (reuse existing logic)
        navigation.navigate('EmotionCapture', {
          returnFrom: 'EntryEdit',
          initialLabels: emotionLabels,
          entryId,
        });
      }
      // Consume focusField so it does not retrigger after returning from EmotionCapture.
      navigation.setParams({ focusField: undefined });
    }, 100);

    return () => clearTimeout(timer);
  }, [entry, focusField, entryId, navigation]);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvent, (e) => {
      keyboardDurationRef.current = e?.duration ?? 300;
      setKeyboardHeight(e?.endCoordinates?.height ?? 0);
      setIsKeyboardOpen(true);
    });
    const hideSub = Keyboard.addListener(hideEvent, () => {
      setKeyboardHeight(0);
      setIsKeyboardOpen(false);
    });
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  useEffect(() => {
    const duration = keyboardDurationRef.current;
    if (isTitleEditing) {
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
    } else {
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
    }
  }, [isTitleEditing]);

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
      descriptionContainerTranslateY.setValue(100);
      descriptionBlurOpacity.setValue(0);
      descriptionCloseButtonOpacity.setValue(0);
      descriptionSaveButtonOpacity.setValue(0);
    });
  };

  const handleDescriptionSave = () => {
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
      descriptionContainerTranslateY.setValue(100);
      descriptionBlurOpacity.setValue(0);
      descriptionCloseButtonOpacity.setValue(0);
      descriptionSaveButtonOpacity.setValue(0);
    });
  };

  const handleBack = () => {
    if (showDescriptionInput) {
      handleDescriptionClose();
      return;
    }
    Alert.alert(
      'Discard changes?',
      'Are you sure you want to go back?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Yes',
          onPress: () => {
            try {
              navigation.goBack();
            } catch (e) {
              logger.warn('EntryEditScreen: goBack failed', e);
            }
          },
        },
      ]
    );
  };

  const handleSave = async () => {
    if (!entry) return;
    setIsSaving(true);
    try {
      const merged: Entry = {
        ...entry,
        title: title.trim() || undefined,
        description: description.trim(),
        valence: undefined,
        arousal: undefined,
        emotionLabels: emotionLabels.length > 0 ? emotionLabels : undefined,
        emotionNote: emotionNote.trim() ? emotionNote.trim().slice(0, 200) : undefined,
        isAwe: isAweTagged,
      };
      const coordsRemoved = merged.latitude == null || merged.longitude == null;
      const latChanged =
        entry.latitude != null &&
        entry.longitude != null &&
        merged.latitude != null &&
        merged.longitude != null &&
        (entry.latitude !== merged.latitude || entry.longitude !== merged.longitude);
      let toSave = merged;
      if (coordsRemoved) {
        toSave = { ...merged, country: undefined, city: undefined };
      } else if (latChanged) {
        toSave = await attachCountryToEntryIfMissing({ ...merged, country: undefined, city: undefined });
      } else {
        toSave = await attachCountryToEntryIfMissing(merged);
      }
      await updateEntry(toSave);
      navigation.goBack();
    } catch (error) {
      Alert.alert('Error', 'Failed to save changes. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: { flex: 1, backgroundColor: colors.background },
        backButton: { position: 'absolute', zIndex: 100, padding: 8 },
        detailsContentContainer: { position: 'absolute', left: 0, right: 0, zIndex: 1 },
        titleInput: {
          position: 'absolute',
          fontFamily: FONTS.inter,
          fontWeight: FONT_WEIGHTS.semibold,
          color: colors.borderLight,
          textAlign: 'center',
          backgroundColor: 'transparent',
          paddingVertical: 0,
          paddingHorizontal: 0,
        },
        detailsAddMoreText: {
          position: 'absolute',
          fontFamily: FONTS.inter,
          fontWeight: FONT_WEIGHTS.regular,
          color: colors.textSecondary,
          textAlign: 'center',
        },
        detailsControlsRow: { position: 'absolute', flexDirection: 'row', justifyContent: 'center', alignItems: 'center' },
        detailsBookmarkIconWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
        actionButton: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: 'transparent',
          borderWidth: 1,
          borderColor: colors.textPrimary,
        },
        actionButtonText: { color: colors.textPrimary, fontFamily: FONTS.inter, fontWeight: FONT_WEIGHTS.bold },
        detailsSaveButton: { position: 'absolute', left: 0, right: 0, alignItems: 'center', zIndex: 10 },
        saveButtonText: { fontFamily: FONTS.inter, fontWeight: FONT_WEIGHTS.black, textAlign: 'center' },
        mediaPlaceholder: {
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
          backgroundColor: colors.stone600,
        },
        mediaIcon: { fontSize: 48 },
        errorContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
        errorText: { fontFamily: FONTS.inter, fontSize: 18, color: colors.textPrimary },
        descriptionBlurOverlay: {
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: colors.background,
          zIndex: 1000,
        },
        blurTouchable: { flex: 1 },
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
        descriptionCloseText: { fontSize: 32, color: colors.textPrimary, fontWeight: FONT_WEIGHTS.bold },
        descriptionTextInputWrapper: { flex: 1, marginTop: 24, marginBottom: 110 },
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
          left: 0,
          right: 0,
          backgroundColor: colors.surface,
          paddingHorizontal: 16,
          paddingBottom: 20,
          zIndex: 1001,
        },
        emotionCloseButton: {
          position: 'absolute',
          right: 16,
          width: 40,
          height: 40,
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 1002,
        },
        emotionCloseText: { fontSize: 32, color: colors.textPrimary, fontWeight: FONT_WEIGHTS.bold },
      }),
    [colors]
  );

  if (!entry) {
    return (
      <View style={styles.container}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <BackArrow width={19} height={21} color={colors.textPrimary} />
        </TouchableOpacity>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>Entry not found</Text>
        </View>
      </View>
    );
  }

  const imageUri =
    entry.mediaType === 'photo' && entry.photoPaths?.length ? entry.photoPaths[0] : null;

  const detailsOverlayContainerHeight = isKeyboardOpen
    ? screenHeight - keyboardHeight - containerTop
    : 800 * scaleFactor;
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
      <TouchableOpacity
        style={[styles.backButton, { top: insets.top + 60, left: 25 * scaleFactor }]}
        onPress={handleBack}
        activeOpacity={0.7}
      >
        <BackArrow width={19} height={21} color={colors.textPrimary} />
      </TouchableOpacity>

      <View style={[styles.detailsContentContainer, { top: containerTop, height: Math.max(0, currentPositions.containerHeight - containerBottomInset) }]}>
        <Animated.View
          style={{
            position: 'absolute',
            left: isTitleEditing
              ? currentPositions.imageLeft
              : (screenWidth - positionsClosed.imageWidth * 0.85) / 2,
            top: isTitleEditing ? currentPositions.imageTop : positionsClosed.imageTop,
            width: isTitleEditing ? currentPositions.imageWidth : positionsClosed.imageWidth * 0.85,
            height: isTitleEditing ? currentPositions.imageHeight : positionsClosed.imageHeight * 0.85,
            borderRadius: 24,
            overflow: 'hidden',
            transform: [{ scale: imageScale }, { translateY: imageTranslateY }],
          }}
        >
          {imageUri ? (
            <EntryPhotoImage
              uri={imageUri}
              style={StyleSheet.absoluteFill}
              resizeMode="cover"
              fallbackBackgroundColor={colors.surface}
            />
          ) : (
            <View style={styles.mediaPlaceholder}>
              <Text style={styles.mediaIcon}>📷</Text>
            </View>
          )}
        </Animated.View>

        {isTitleEditing && (
          <TouchableOpacity
            style={{
              position: 'absolute',
              left: currentPositions.imageLeft,
              top: currentPositions.imageTop,
              width: currentPositions.imageWidth,
              height: currentPositions.imageHeight,
            }}
            activeOpacity={1}
            onPress={() => {
              Keyboard.dismiss();
              titleInputRef.current?.blur();
            }}
          />
        )}

        <TextInput
          ref={titleInputRef}
          style={[styles.titleInput, {
            top: isTitleEditing ? getPositionsOpen().titleInputTop : positionsClosed.detailsTitleTop,
            left: isTitleEditing ? getPositionsOpen().titleInputLeft : positionsClosed.titleTextLeft,
            width: isTitleEditing ? getPositionsOpen().titleInputWidth : positionsClosed.titleTextWidth,
            fontSize: 20 * scaleFactor,
          }]}
          placeholder="Add a title..."
          placeholderTextColor={colors.borderLight}
          value={title}
          onChangeText={setTitle}
          onFocus={() => setIsTitleFocused(true)}
          onBlur={() => setIsTitleFocused(false)}
          blurOnSubmit
          returnKeyType="done"
          onSubmitEditing={() => {
            Keyboard.dismiss();
            titleInputRef.current?.blur();
          }}
        />

        {/* "Add more details:" — Figma layout (same as capture extra-details) */}
        <Text
          style={[styles.detailsAddMoreText, {
            top: positionsClosed.detailsAddMoreTop,
            left: 25 * scaleFactor,
            right: 24 * scaleFactor,
            fontSize: 12 * scaleFactor,
            zIndex: 2,
          }]}
        >
          Add more details:
        </Text>

        {/* Two rows: Row 1 Description + Emotion; Row 2 Bookmark centered */}
        <View
          style={[styles.detailsControlsRow, {
            left: (screenWidth - positionsClosed.imageWidth) / 2,
            width: positionsClosed.imageWidth,
            top: positionsClosed.detailsButtonsTop,
            flexDirection: 'column',
            alignItems: 'center',
            gap: 10 * scaleFactor,
            zIndex: 2,
          }]}
        >
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'center',
              alignItems: 'center',
              gap: 8 * scaleFactor,
              minHeight: 36 * scaleFactor,
            }}
          >
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
              onPress={() =>
                navigation.navigate('EmotionCapture', {
                  returnFrom: 'EntryEdit',
                  initialLabels: emotionLabels,
                  entryId,
                })
              }
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
            onPress={() => setIsAweTagged((prev) => !prev)}
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

        <TouchableOpacity
          style={[styles.detailsSaveButton, {
            top: positionsClosed.detailsSaveTop,
            width: screenWidth,
          }]}
          onPress={handleSave}
          disabled={isSaving}
          activeOpacity={0.7}
        >
          {isSaving ? (
            <Text style={[styles.saveButtonText, { fontSize: 25 * scaleFactor }]}>Saving...</Text>
          ) : (
            <GradientText style={[styles.saveButtonText, { fontSize: 25 * scaleFactor }]}>SAVE</GradientText>
          )}
        </TouchableOpacity>
      </View>

      {showDescriptionInput && (
        <View style={detailsOverlayWrapperStyle}>
          <Animated.View style={[styles.descriptionBlurOverlay, { opacity: descriptionBlurOpacity }]}>
            <TouchableOpacity style={styles.blurTouchable} activeOpacity={1} onPress={handleDescriptionClose} />
          </Animated.View>
          <Animated.View
            style={[styles.descriptionContainer, {
              transform: [{ translateY: descriptionContainerTranslateY }],
              height: '100%',
              paddingTop: Math.max(28, Math.round(0.06 * screenHeight) - SPACING.sm),
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
                style={[styles.descriptionSaveButton, { bottom: isKeyboardOpen ? 50 : 125 }]}
                onPress={handleDescriptionSave}
                activeOpacity={0.7}
              >
                <Text style={styles.descriptionSaveButtonText}>Save</Text>
            </TouchableOpacity>
            </Animated.View>
          </Animated.View>
          </View>
      )}

    </View>
  );
};

export default EntryEditScreen;
