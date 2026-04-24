// CaptureScreen
// Photo/video/audio capture screen with lazy-loaded expo-camera and expo-audio

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Image, Alert, Platform, Keyboard, Animated, Easing, Dimensions, ScrollView, TouchableWithoutFeedback, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useIsFocused } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  PinchGestureHandler,
  State as GestureState,
  type PinchGestureHandlerGestureEvent,
  type PinchGestureHandlerStateChangeEvent,
} from 'react-native-gesture-handler';
import { RootStackParamList } from '../navigation/types';
import { useAppContext } from '../context/AppContext';
import { useProgress } from '../context/ProgressContext';
import { COLORS, SPACING, FONTS, FONT_WEIGHTS, DIMENSIONS } from '../config/constants';
import { BOTTOM_SAFE_BUFFER, getAvailableHeight } from '../utils/layout';
import { TEXT_STYLES } from '../config/typography';
import { useTheme } from '../context/ThemeContext';
import type { ThemeColors } from '../config/theme';
import AudioWaveform from '../components/capture/AudioWaveform';
import BackArrow from '../components/common/icons/BackArrow';
import FlashIcon from '../components/common/icons/FlashIcon';
import CameraSwitchIcon from '../components/common/icons/CameraSwitchIcon';
import PenIcon from '../components/common/icons/PenIcon';
import HeartIcon from '../components/common/icons/HeartIcon';
import CompassIcon from '../components/common/icons/CompassIcon';
import { LinearGradient } from 'expo-linear-gradient';
import { generateUUID } from '../utils/uuid';
import { getSeasonFromTimestamp } from '../utils/seasonUtils';
import { getWeatherAtLocation } from '../services/WeatherService';
import { Entry } from '../models/Entry';
import { attachCountryToEntryIfMissing } from '../utils/entryCountryResolve';
import { copyMediaToPersistentStorage, resolveMediaPath } from '../storage/mediaStorage';
import { extractColorPalettesForEntry } from '../services/ColorExtractionService';
import * as PersistenceManager from '../storage/PersistenceManager';
// Import expo-audio at top level to use hooks properly
import { useAudioRecorder, RecordingPresets, requestRecordingPermissionsAsync } from 'expo-audio';
import { ANIMATION_CONFIG, createSpringConfig } from '../utils/animations';
import { logger } from '../utils/logger';
import GradientText from '../components/common/GradientText';
import EmotionalCaptureFlow from '../components/capture/EmotionalCaptureFlow';

type CaptureScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, 'Capture'>;

type MediaType = 'photo' | 'video' | 'audio';
type ZoomPreset = '0.5x' | '1x' | 'custom';

const ZOOM_MIN = 0;
const ZOOM_MAX = 1;
const ZOOM_SENSITIVITY = 0.35;
const PINCH_DEAD_ZONE = 0.015;
const PINCH_UPDATE_INTERVAL_MS = 16;

const CaptureScreen: React.FC = () => {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<CaptureScreenNavigationProp>();
  const {
    createEntry,
    activeTripAlbum,
    pendingEmotionLabels,
    setPendingEmotionLabels,
    pendingEmotionNote,
    setPendingEmotionNote,
  } = useAppContext();
  const { record } = useProgress();
  const [mediaType, setMediaType] = useState<MediaType>('photo');
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraHardwareReady, setCameraHardwareReady] = useState(false);
  const [permissionGranted, setPermissionGranted] = useState(false);
  const [cameraKey, setCameraKey] = useState<string>('camera-photo'); // Key for forcing remount
  // Camera controls: swap, flash (at capture only)
  const [facing, setFacing] = useState<'back' | 'front'>('back');
  const [flashMode, setFlashMode] = useState<'off' | 'on' | 'auto'>('off');
  const [cameraZoom, setCameraZoom] = useState<number>(0);
  const [activeZoomPreset, setActiveZoomPreset] = useState<ZoomPreset>('1x');
  const [availableLenses, setAvailableLenses] = useState<string[]>([]);
  const [selectedLens, setSelectedLens] = useState<string | undefined>(undefined);
  const [cameraMountError, setCameraMountError] = useState<string | null>(null);
  const [isPinching, setIsPinching] = useState(false);
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [audioUri, setAudioUri] = useState<string | null>(null);
  const [title, setTitle] = useState<string>('');

  // Keep ref in sync with title state for use in keyboard listeners
  useEffect(() => {
    titleRef.current = title;
  }, [title]);
  const [showTitleInput, setShowTitleInput] = useState<boolean>(false);
  /** True when user tapped the displayed title (Screen 3) to reopen title editor; cleared when keyboard hides */
  const [isReopeningTitleEdit, setIsReopeningTitleEdit] = useState<boolean>(false);
  const [isKeyboardOpen, setIsKeyboardOpen] = useState<boolean>(false);
  const [keyboardHeight, setKeyboardHeight] = useState<number>(0);

  // Description feature state
  const [description, setDescription] = useState<string>('');
  const [showDescriptionScreen, setShowDescriptionScreen] = useState<boolean>(false);
  const [descriptionText, setDescriptionText] = useState<string>(''); // Temporary editing state
  const descriptionInputRef = useRef<TextInput>(null);

  // Emotion feature state (in-screen overlay on Extra Data, like Description)
  const [emotionLabels, setEmotionLabels] = useState<string[]>([]);
  const [emotionNote, setEmotionNote] = useState<string>('');
  const [showEmotionScreen, setShowEmotionScreen] = useState<boolean>(false);

  // Bookmark state (tag experience as full of awe; isAweTagged kept for data model)
  const [isAweTagged, setIsAweTagged] = useState<boolean>(false);

  // When true, extra-data screen is shown without a title (user tapped "Skip"); title area shows "Add a title..."
  const [userSkippedTitle, setUserSkippedTitle] = useState<boolean>(false);

  // Animation values for capture button
  const captureButtonScale = useRef(new Animated.Value(1)).current;

  // Animation values for media type buttons
  const mediaTypeAnimations = useRef({
    photo: { opacity: new Animated.Value(1), scale: new Animated.Value(1) },
    video: { opacity: new Animated.Value(0.5), scale: new Animated.Value(0.98) },
    audio: { opacity: new Animated.Value(0.5), scale: new Animated.Value(0.98) },
  }).current;

  // Photo flash animation
  const photoFlashOpacity = useRef(new Animated.Value(0)).current;

  // Animation values for keyboard transitions
  const imageScale = useRef(new Animated.Value(1)).current;
  const imageTranslateY = useRef(new Animated.Value(0)).current;

  // Animation values for Screen 3 (Add more details + buttons)
  const addMoreInfoOpacity = useRef(new Animated.Value(0)).current;
  const addMoreInfoTranslateY = useRef(new Animated.Value(10)).current;
  const descriptionButtonOpacity = useRef(new Animated.Value(0)).current;
  const descriptionButtonTranslateY = useRef(new Animated.Value(10)).current;
  const emotionButtonOpacity = useRef(new Animated.Value(0)).current;
  const emotionButtonTranslateY = useRef(new Animated.Value(10)).current;
  const aweButtonOpacity = useRef(new Animated.Value(0)).current;
  const aweButtonTranslateY = useRef(new Animated.Value(10)).current;

  // Description screen animation values
  const descriptionBlurOpacity = useRef(new Animated.Value(0)).current;
  const descriptionContainerTranslateY = useRef(new Animated.Value(100)).current;
  const descriptionCloseButtonOpacity = useRef(new Animated.Value(0)).current;
  const descriptionSaveButtonOpacity = useRef(new Animated.Value(0)).current;

  // Emotion overlay animation values (mirror Description)
  const emotionBlurOpacity = useRef(new Animated.Value(0)).current;
  const emotionContainerTranslateY = useRef(new Animated.Value(100)).current;
  const emotionCloseButtonOpacity = useRef(new Animated.Value(0)).current;

  const styles = useMemo(() => createCaptureStyles(colors), [colors]);
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const isFocused = useIsFocused();

  // Calculate constants from current window (safe area applied so content clears notch/home indicator)
  const scaleFactor = Math.min(Math.max(windowWidth, 320), 430) / 390;
  const cameraControlScale = 1.2; // multiplier for swap, flash button and icon size
  const containerTop = insets.top + 74 * scaleFactor;
  const screenHeight = windowHeight;
  const containerBottomInset = Number.isFinite(insets.bottom) ? insets.bottom : 0;
  const availableHeight = getAvailableHeight(windowHeight, { top: insets.top, bottom: containerBottomInset }, containerTop);

  // Image/camera rect in content-container coordinates
  const imageTopClosed = 107.07 * scaleFactor - containerTop;
  const imageHeightClosed = 463.033 * scaleFactor;
  const imageBottomClosed = imageTopClosed + imageHeightClosed;

  // Extra-data screen (Screen 3): image scaled down to leave enough vertical room for the details + SAVE button.
  // Smaller devices (e.g. iPhone SE, 375px wide) get a more aggressive scale so all content fits without scrolling.
  const imageScaleExtraData = windowWidth < 380 ? 0.75 : 0.85;
  const imageBottomScreen3 = imageTopClosed + imageHeightClosed * imageScaleExtraData;
  const titleOffsetDown = Number.isFinite(screenHeight) ? screenHeight * 0.05 : 0;
  const bottomSafeInset = Number.isFinite(DIMENSIONS.extraDataBottomSafeInset)
    ? DIMENSIONS.extraDataBottomSafeInset
    : 28;
  const extraDataTitleTop = imageBottomScreen3 + SPACING.md + titleOffsetDown - bottomSafeInset;
  const extraDataAddMoreTop = extraDataTitleTop + 28 * scaleFactor + SPACING.xs;
  const extraDataButtonsTop = extraDataAddMoreTop + 14 * scaleFactor + SPACING.sm;
  const buttonRowHeight = 36 * scaleFactor;
  const buttonRowGap = 10 * scaleFactor;
  const extraDataSaveTop = extraDataButtonsTop + buttonRowHeight + buttonRowGap + buttonRowHeight + SPACING.xl;

  const positionsClosed = {
    imageWidth: 344 * scaleFactor,
    imageHeight: imageHeightClosed,
    imageLeft: 25 * scaleFactor,
    imageTop: imageTopClosed,
    containerHeight: 800 * scaleFactor,
    titleTextTop: imageBottomClosed + SPACING.md,
    titleTextLeft: 25 * scaleFactor,
    titleTextWidth: windowWidth - 49 * scaleFactor,
    extraDataTitleTop,
    extraDataAddMoreTop,
    extraDataButtonsTop,
    extraDataSaveTop,
  };

  const getPositionsOpen = () => {
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
  };

  const currentPositions = useMemo(() => {
    return isKeyboardOpen ? getPositionsOpen() : positionsClosed;
  }, [isKeyboardOpen, keyboardHeight, scaleFactor, containerTop]);

  // Check if media has been captured
  const hasCapturedMedia = photoUri !== null || audioUri !== null;
  const hasTitle = title.trim().length > 0;

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

  // Lazy-loaded modules
  const [CameraView, setCameraView] = useState<any>(null);
  const [Camera, setCamera] = useState<any>(null);
  const [Location, setLocation] = useState<any>(null);
  const [currentLocation, setCurrentLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [currentAltitude, setCurrentAltitude] = useState<number | null>(null);
  const [audioPermissionGranted, setAudioPermissionGranted] = useState(false);
  const cameraRef = useRef<any>(null);
  const cameraZoomRef = useRef(0);
  const pinchStartZoomRef = useRef(0);
  const lastPinchUpdateRef = useRef(0);
  const audioRecordingRef = useRef<any>(null);
  const titleInputRef = useRef<TextInput>(null);
  const titleRef = useRef<string>('');

  // Initialize audio recorder using expo-audio hook (must be called unconditionally)
  const audioRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);

  useEffect(() => {
    // Request audio recording permissions on mount
    const requestAudioPermissions = async () => {
      try {
        const { granted } = await requestRecordingPermissionsAsync();
        setAudioPermissionGranted(granted);
      } catch (error) {
        logger.error('Error requesting audio permission:', error);
      }
    };
    requestAudioPermissions();
  }, []);

  useEffect(() => {
    cameraZoomRef.current = cameraZoom;
  }, [cameraZoom]);

  const clampZoom = useCallback((value: number) => {
    if (!Number.isFinite(value)) {
      return cameraZoomRef.current;
    }
    return Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, value));
  }, []);

  const supportsPreset = useCallback((preset: Exclude<ZoomPreset, 'custom'>) => {
    if (facing !== 'back') {
      return preset === '1x';
    }
    if (Platform.OS !== 'ios') {
      return preset !== '0.5x';
    }

    // Lenses not yet loaded: optimistically allow 0.5x on iOS so the tap is not
    // silently discarded; applyZoomPreset will revert gracefully if the lens is
    // genuinely unavailable once the list arrives.
    if (!availableLenses.length) {
      return true;
    }

    const lowerLenses = availableLenses.map((lens) => lens.toLowerCase());
    if (preset === '0.5x') {
      return lowerLenses.some((lens) => lens.includes('ultra'));
    }
    return true;
  }, [availableLenses, facing]);

  // Returns the first available lens whose name contains ANY of includeKeywords
  // and NONE of excludeKeywords (case-insensitive). Returns undefined when the
  // list is empty or no lens matches — callers must handle the undefined case
  // without bailing on the whole operation (lens list may arrive asynchronously).
  const getLensByKeyword = useCallback((includeKeywords: string[], excludeKeywords: string[] = []) => {
    const lowerInclude = includeKeywords.map((k) => k.toLowerCase());
    const lowerExclude = excludeKeywords.map((k) => k.toLowerCase());
    return availableLenses.find((lens) => {
      const lower = lens.toLowerCase();
      const matched = lowerInclude.some((k) => lower.includes(k));
      const excluded = lowerExclude.some((k) => lower.includes(k));
      return matched && !excluded;
    });
  }, [availableLenses]);

  const setZoomSafely = useCallback((nextZoom: number) => {
    setCameraZoom(clampZoom(nextZoom));
  }, [clampZoom]);

  const applyZoomPreset = useCallback((preset: Exclude<ZoomPreset, 'custom'>) => {
    if (!cameraHardwareReady || !permissionGranted || hasCapturedMedia || mediaType !== 'photo') {
      return;
    }

    if (facing !== 'back') {
      setSelectedLens(undefined);
      setZoomSafely(0);
      setActiveZoomPreset('1x');
      return;
    }

    if (Platform.OS === 'ios') {
      const ultraWideLens = getLensByKeyword(['ultra']);
      const teleLens = getLensByKeyword(['tele']);
      // Physical wide = the simplest back camera: excludes virtual (dual/triple),
      // ultra-wide, and telephoto. On every iPhone this resolves to "Back Camera"
      // (builtInWideAngleCamera). We use it explicitly rather than selectedLens=undefined
      // because defaultBackCamera on iOS 17+ checks systemPreferredCamera first, which
      // can point to ultra-wide if the user previously used it in any app.
      const physicalWideLens = availableLenses.find(l => {
        const lower = l.toLowerCase();
        return !lower.includes('ultra') &&
               !lower.includes('dual') &&
               !lower.includes('triple') &&
               !lower.includes('tele');
      });

      if (preset === '0.5x') {
        setSelectedLens(ultraWideLens ?? undefined);
        setActiveZoomPreset('0.5x');
        setZoomSafely(0);
        return;
      }

      if (preset === '1x') {
        // Use the physical wide camera explicitly. If the lens list hasn't arrived yet
        // (physicalWideLens=undefined), the late-binding effect upgrades it on arrival.
        setSelectedLens(physicalWideLens);
        setActiveZoomPreset('1x');
        setZoomSafely(0);
        return;
      }

      // 2x: telephoto if present, otherwise physical wide
      setSelectedLens(teleLens ?? physicalWideLens);
      setActiveZoomPreset('1x');
      setZoomSafely(0);
      return;
    }

    // Android: digital zoom only
    setActiveZoomPreset(preset);
    setZoomSafely(0);
  }, [
    cameraHardwareReady,
    permissionGranted,
    hasCapturedMedia,
    mediaType,
    facing,
    availableLenses,
    getLensByKeyword,
    setZoomSafely,
  ]);

  // Derives the base multiplier from the physically active lens.
  // selectedLens is the authoritative source when the lens list has loaded.
  // activeZoomPreset is a fallback for when selectedLens is still undefined
  // (e.g. Expo Go where onAvailableLensesChanged may not fire).
  const lensBaseZoom = useMemo(() => {
    if (facing !== 'back') return 1;
    if (selectedLens?.toLowerCase().includes('ultra')) return 0.5;
    if (activeZoomPreset === '0.5x') return 0.5;
    return 1;
  }, [facing, selectedLens, activeZoomPreset]);

  const effectiveZoomScale = useMemo(() => {
    const zoomRangeMultiplier = lensBaseZoom === 0.5 ? 1.5 : 2;
    const scale = lensBaseZoom + cameraZoom * zoomRangeMultiplier;
    return Math.max(0.5, Math.min(3, scale));
  }, [lensBaseZoom, cameraZoom]);

  const zoomButtonLabel = useMemo(() => {
    const rounded = Math.round(effectiveZoomScale * 10) / 10;
    return Number.isInteger(rounded) ? `${rounded.toFixed(0)}x` : `${rounded.toFixed(1)}x`;
  }, [effectiveZoomScale]);

  const handleZoomButtonPress = useCallback(() => {
    if (!cameraHardwareReady || !permissionGranted || hasCapturedMedia || mediaType !== 'photo') {
      return;
    }
    if (!supportsPreset('0.5x')) {
      applyZoomPreset('1x');
      return;
    }
    applyZoomPreset(activeZoomPreset === '0.5x' ? '1x' : '0.5x');
  }, [
    cameraHardwareReady,
    permissionGranted,
    hasCapturedMedia,
    mediaType,
    supportsPreset,
    applyZoomPreset,
    activeZoomPreset,
  ]);

  const handlePinchGesture = useCallback((event: PinchGestureHandlerGestureEvent) => {
    if (!cameraHardwareReady || !permissionGranted || hasCapturedMedia || mediaType !== 'photo') {
      return;
    }

    const now = Date.now();
    if (now - lastPinchUpdateRef.current < PINCH_UPDATE_INTERVAL_MS) {
      return;
    }
    lastPinchUpdateRef.current = now;

    const scale = event.nativeEvent.scale;
    if (!Number.isFinite(scale)) {
      return;
    }
    const scaleDelta = scale - 1;
    if (Math.abs(scaleDelta) <= PINCH_DEAD_ZONE) {
      return;
    }

    // Compute unclamped zoom so we can detect when the gesture crosses a lens
    // boundary (i.e. the user wants to zoom beyond what the current lens can show).
    const unclampedZoom = pinchStartZoomRef.current + scaleDelta * ZOOM_SENSITIVITY;
    const targetZoom = clampZoom(unclampedZoom);

    // iOS physical-lens cross-boundary switching — mirrors native Camera behaviour:
    //   • Pinch OUT past the wide-lens ceiling while on ultra-wide → switch to wide at 1x
    //   • Pinch IN past the wide-lens floor                        → switch to ultra-wide at 0.5x
    if (Platform.OS === 'ios' && facing === 'back') {
      const currentLensIsUltraWide = selectedLens?.toLowerCase().includes('ultra') ?? false;

      if (currentLensIsUltraWide && unclampedZoom > ZOOM_MAX) {
        // Crossing the upper boundary of the ultra-wide lens range → switch to 1x.
        // Use undefined (defaultBackCamera = physical builtInWideAngleCamera) rather
        // than getLensByKeyword('wide') which would match the virtual dual-wide camera.
        setSelectedLens(undefined);
        setCameraZoom(0);
        cameraZoomRef.current = 0;
        pinchStartZoomRef.current = 0;
        setActiveZoomPreset('1x');
        return;
      }

      if (!currentLensIsUltraWide && unclampedZoom < ZOOM_MIN) {
        // Crossing the lower boundary of the wide-lens range
        const ultraWideLens = getLensByKeyword(['ultra']);
        if (ultraWideLens) {
          setSelectedLens(ultraWideLens);
          setCameraZoom(0);
          cameraZoomRef.current = 0;
          pinchStartZoomRef.current = 0;
          setActiveZoomPreset('0.5x');
          return;
        }
      }
    }

    if (Math.abs(targetZoom - cameraZoomRef.current) < 0.002) {
      return;
    }
    setCameraZoom(targetZoom);
    setActiveZoomPreset('custom');
  }, [cameraHardwareReady, permissionGranted, hasCapturedMedia, mediaType, facing, selectedLens, getLensByKeyword, clampZoom]);

  const handlePinchStateChange = useCallback((event: PinchGestureHandlerStateChangeEvent) => {
    const { state } = event.nativeEvent;
    if (state === GestureState.BEGAN) {
      setIsPinching(true);
      pinchStartZoomRef.current = cameraZoomRef.current;
      return;
    }
    if (state === GestureState.END || state === GestureState.CANCELLED || state === GestureState.FAILED) {
      setIsPinching(false);
      pinchStartZoomRef.current = cameraZoomRef.current;
    }
  }, []);

  const handleAvailableLensesChanged = useCallback((event: any) => {
    const rawLenses = event?.lenses ?? event?.nativeEvent?.lenses;
    const nextLenses = Array.isArray(rawLenses) ? rawLenses.filter((lens) => typeof lens === 'string') : [];
    setAvailableLenses(nextLenses);
  }, []);

  // Late-binding: when the lens list arrives (via getAvailableLensesAsync in onCameraReady),
  // ensure the selected lens matches the active preset. This handles two cases:
  //   • Initial open: lenses arrive after mount; forces the physical wide camera for 1x
  //     (prevents iOS 17 systemPreferredCamera from defaulting to ultra-wide).
  //   • Race: user tapped a preset before the list loaded; upgrades selectedLens now.
  useEffect(() => {
    if (!availableLenses.length || facing !== 'back') return;

    if (activeZoomPreset === '0.5x') {
      const ultraWideLens = availableLenses.find(l => l.toLowerCase().includes('ultra'));
      if (ultraWideLens && selectedLens !== ultraWideLens) {
        setSelectedLens(ultraWideLens);
      }
      return;
    }

    if (activeZoomPreset === '1x') {
      const physicalWide = availableLenses.find(l => {
        const lower = l.toLowerCase();
        return !lower.includes('ultra') && !lower.includes('dual') &&
               !lower.includes('triple') && !lower.includes('tele');
      });
      if (physicalWide && selectedLens !== physicalWide) {
        setSelectedLens(physicalWide);
      }
    }
  }, [availableLenses, facing, activeZoomPreset, selectedLens]);

  useEffect(() => {
    // Lazy-load expo-camera only when component mounts
    const loadModules = async () => {
      try {
        const cameraModule = await import('expo-camera');
        setCameraView(() => cameraModule.CameraView);
        setCamera(() => cameraModule.Camera);
        setCameraReady(true);

        const { status } = await cameraModule.Camera.requestCameraPermissionsAsync();
        setPermissionGranted(status === 'granted');

        // Load location
        const locationModule = await import('expo-location');
        setLocation(() => locationModule);

        // Request location permission and get current location
        const { status: locationStatus } = await locationModule.requestForegroundPermissionsAsync();
        if (locationStatus === 'granted') {
          const location = await locationModule.getCurrentPositionAsync({});
          setCurrentLocation({
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
          });
          const alt = location.coords.altitude;
          if (typeof alt === 'number' && !Number.isNaN(alt)) {
            setCurrentAltitude(alt);
          }
        }
      } catch (error) {
        logger.error('Failed to load modules:', error);
        Alert.alert('Error', 'Media capture is not available');
      }
    };

    loadModules();
  }, []);


  // Keyboard event listeners with image animations
  useEffect(() => {
    const keyboardShowEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const keyboardHideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSubscription = Keyboard.addListener(keyboardShowEvent, (e) => {
      const height = e.endCoordinates.height;
      const duration = e.duration || 300;

      setKeyboardHeight(height);
      setIsKeyboardOpen(true);

      // Animate image: scale to 0.85, translateY to -30
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
      const duration = e.duration || 300;

      setKeyboardHeight(0);
      setIsKeyboardOpen(false);
      // Clear "reopened title edit" so we return to Screen 3 (title display) instead of showing the input
      setIsReopeningTitleEdit(false);

      // Only return to Screen 1 if no title has been entered
      // If title exists, keep showTitleInput true so Screen 3 can show
      // Use ref to get current title value (not closure value)
      setTimeout(() => {
        const currentTitle = titleRef.current.trim();
        if (currentTitle.length === 0) {
          // No title, return to Screen 1
          setShowTitleInput(false);
        }
        // If title exists, showTitleInput stays true
        // Screen 3 will show because: hasTitle && !isKeyboardOpen
      }, 0);

      // Animate image back: scale to 1, translateY to 0
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
  }, []);

  // Reset camera ready when facing changes (camera remounts with new key)
  useEffect(() => {
    setCameraHardwareReady(false);
    setCameraMountError(null);
    setCameraZoom(0);
    setActiveZoomPreset('1x');
    setSelectedLens(undefined);
    setAvailableLenses([]);
  }, [facing]);

  // Animate extra-details buttons when media is captured and keyboard is closed
  useEffect(() => {
    if (hasCapturedMedia && !isKeyboardOpen) {
      // Staggered animation: "Add more details:" then buttons
      Animated.parallel([
        Animated.parallel([
          Animated.timing(addMoreInfoOpacity, { toValue: 1, duration: 300, delay: 0, easing: ANIMATION_CONFIG.easing.easeOut, useNativeDriver: true }),
          Animated.timing(addMoreInfoTranslateY, { toValue: 0, duration: 300, delay: 0, easing: ANIMATION_CONFIG.easing.easeOut, useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(descriptionButtonOpacity, {
            toValue: 1,
            duration: 300,
            delay: 50,
            easing: ANIMATION_CONFIG.easing.easeOut,
            useNativeDriver: true
          }),
          Animated.timing(descriptionButtonTranslateY, {
            toValue: 0,
            duration: 300,
            delay: 50,
            easing: ANIMATION_CONFIG.easing.easeOut,
            useNativeDriver: true
          }),
        ]),
        Animated.parallel([
          Animated.timing(emotionButtonOpacity, {
            toValue: 1,
            duration: 300,
            delay: 50,
            easing: ANIMATION_CONFIG.easing.easeOut,
            useNativeDriver: true
          }),
          Animated.timing(emotionButtonTranslateY, {
            toValue: 0,
            duration: 300,
            delay: 50,
            easing: ANIMATION_CONFIG.easing.easeOut,
            useNativeDriver: true
          }),
        ]),
        Animated.parallel([
          Animated.timing(aweButtonOpacity, {
            toValue: 1,
            duration: 300,
            delay: 50,
            easing: ANIMATION_CONFIG.easing.easeOut,
            useNativeDriver: true
          }),
          Animated.timing(aweButtonTranslateY, {
            toValue: 0,
            duration: 300,
            delay: 50,
            easing: ANIMATION_CONFIG.easing.easeOut,
            useNativeDriver: true
          }),
        ]),
      ]).start();
    } else {
      addMoreInfoOpacity.setValue(0);
      addMoreInfoTranslateY.setValue(10);
      descriptionButtonOpacity.setValue(0);
      descriptionButtonTranslateY.setValue(10);
      emotionButtonOpacity.setValue(0);
      emotionButtonTranslateY.setValue(10);
      aweButtonOpacity.setValue(0);
      aweButtonTranslateY.setValue(10);
    }
  }, [hasCapturedMedia, isKeyboardOpen]);

  // Media type switch animation
  useEffect(() => {
    // Animate active button
    const activeAnim = mediaTypeAnimations[mediaType];
    Animated.parallel([
      Animated.timing(activeAnim.opacity, {
        toValue: 1,
        duration: 200,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(activeAnim.scale, {
        toValue: 1,
        duration: 200,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start();

    // Animate inactive buttons
    (['photo', 'video', 'audio'] as MediaType[]).forEach(type => {
      if (type !== mediaType) {
        const inactiveAnim = mediaTypeAnimations[type];
        Animated.parallel([
          Animated.timing(inactiveAnim.opacity, {
            toValue: 0.5,
            duration: 200,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(inactiveAnim.scale, {
            toValue: 0.98,
            duration: 200,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
        ]).start();
      }
    });
  }, [mediaType]);


  // Photo flash animation
  useEffect(() => {
    if (photoUri && mediaType === 'photo') {
      // Flash animation: 0 → 1 → 0
      Animated.sequence([
        Animated.timing(photoFlashOpacity, {
          toValue: 1,
          duration: 75,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(photoFlashOpacity, {
          toValue: 0,
          duration: 75,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [photoUri, mediaType]);


  const handleCapture = async () => {
    if (mediaType === 'photo') {
      // Validate camera is ready
      if (!cameraRef.current) {
        Alert.alert('Error', 'Camera not available');
        return;
      }

      if (!permissionGranted) {
        Alert.alert('Error', 'Camera permission not granted');
        return;
      }

      if (!cameraHardwareReady) {
        Alert.alert('Error', 'Camera not ready. Please wait a moment.');
        return;
      }

      // Capture photo
      try {
        const photo = await cameraRef.current.takePictureAsync({
          quality: 0.8,
          base64: false,
        });

        if (photo?.uri) {
          setPhotoUri(photo.uri);
        } else {
          Alert.alert('Error', 'Failed to capture photo');
        }
      } catch (error) {
        logger.error('Error capturing photo:', error);
        Alert.alert('Error', 'Failed to capture photo. Please try again.');
      }
    } else if (mediaType === 'video') {
      // Video recording disabled - show alert
      Alert.alert(
        'Coming Soon',
        'Video recording will be available soon!',
        [{ text: 'OK' }]
      );
      return;
    } else if (mediaType === 'audio') {
      // Audio recording disabled - show alert
      Alert.alert(
        'Not available',
        'Photo capture is available in this version. Audio and video will be added in a future update.',
        [{ text: 'OK' }]
      );
      return;
    }
  };

  const handleRetake = () => {
    setPhotoUri(null);
    setAudioUri(null);
    setIsAweTagged(false);
    setUserSkippedTitle(false);
    setCameraHardwareReady(false);
    setCameraMountError(null);
    setCameraZoom(0);
    setActiveZoomPreset('1x');
    // Explicitly select the physical wide camera so retake always returns to true 1x.
    // We already have the lens list at this point, so avoid using undefined (which
    // on iOS 17+ resolves via systemPreferredCamera and may revert to ultra-wide).
    const physicalWide = availableLenses.find(l => {
      const lower = l.toLowerCase();
      return !lower.includes('ultra') && !lower.includes('dual') &&
             !lower.includes('triple') && !lower.includes('tele');
    });
    setSelectedLens(physicalWide);
  };

  const handleSave = async () => {
    try {
      // Validate media exists
      if (!photoUri && !audioUri) {
        Alert.alert('Error', 'No media captured');
        return;
      }

      // Determine media URI
      const mediaUri = photoUri || audioUri;
      if (!mediaUri) {
        Alert.alert('Error', 'No media file available');
        return;
      }

      const entryId = generateUUID();

      // Copy captured media into Documents/media so paths survive app updates and cache clears.
      let mediaPaths: string[];
      let photoPaths: string[];
      if (photoUri && mediaType === 'photo') {
        try {
          const persistentUris = await copyMediaToPersistentStorage([photoUri], entryId);
          mediaPaths = persistentUris;
          photoPaths = persistentUris;
        } catch (copyError) {
          logger.error('Error copying photo to persistent storage:', copyError);
          Alert.alert('Error', 'Could not save photo. Please try again.');
          return;
        }
      } else if (audioUri && mediaType === 'audio') {
        try {
          const persistentUris = await copyMediaToPersistentStorage([audioUri], entryId);
          mediaPaths = persistentUris;
          photoPaths = [];
        } catch (copyError) {
          logger.error('Error copying audio to persistent storage:', copyError);
          Alert.alert('Error', 'Could not save audio. Please try again.');
          return;
        }
      } else {
        mediaPaths = [mediaUri];
        photoPaths = photoUri ? [photoUri] : [];
      }

      const finalEmotionLabels = [...emotionLabels];

      const timestamp = new Date().toISOString();
      const entry: Entry = {
        id: entryId,
        type: 'experience',
        title: title.trim() || '',
        description: description.trim(),
        mediaType: mediaType,
        mediaPaths,
        photoPaths,
        storageUrls: [],
        emotionLabels: finalEmotionLabels.length > 0 ? finalEmotionLabels : undefined,
        ...(emotionNote.trim() ? { emotionNote: emotionNote.trim().slice(0, 200) } : {}),
        timestamp,
        latitude: currentLocation?.latitude,
        longitude: currentLocation?.longitude,
        albumId: activeTripAlbum?.id,
        season: getSeasonFromTimestamp(timestamp, currentLocation?.latitude),
        ...(typeof currentAltitude === 'number' && !Number.isNaN(currentAltitude) ? { altitudeMeters: currentAltitude } : {}),
        isDraft: false,
        isAwe: isAweTagged,
      };

      if (currentLocation) {
        try {
          const weather = await getWeatherAtLocation(currentLocation.latitude, currentLocation.longitude);
          if (weather) {
            entry.weather = weather.condition;
            entry.temperatureCelsius = weather.temperatureCelsius;
          }
        } catch (_) {
          // Non-blocking; entry saves without weather
        }
      }

      const entryToSave = await attachCountryToEntryIfMissing(entry);
      await createEntry(entryToSave);

      // Fire-and-forget: extract color palettes for photos after the entry is saved.
      // Writes directly to SQLite without triggering a full context refresh.
      if (entryToSave.mediaType === 'photo' && entryToSave.photoPaths.length > 0) {
        const resolvedPaths = entryToSave.photoPaths.map(resolveMediaPath);
        extractColorPalettesForEntry(resolvedPaths)
          .then((palettes) => {
            if (palettes.some((p) => p !== null)) {
              return PersistenceManager.updateEntry({
                ...entryToSave,
                colorPalettes: palettes as string[][],
              });
            }
          })
          .catch(() => {});
      }

      try {
        record('first_live_capture');
      } catch (_) {
        // Non-blocking
      }

      // Reset capture screen
      setPhotoUri(null);
      setAudioUri(null);
      setTitle('');
      setShowTitleInput(false);
      setIsKeyboardOpen(false);
      setKeyboardHeight(0);
      setUserSkippedTitle(false);

      setEmotionLabels([]);
      setEmotionNote('');
      setIsAweTagged(false);

      try {
        // Dismiss Capture and show entry detail so back goes to Home
        navigation.reset({
          index: 1,
          routes: [
            { name: 'MainTabs' },
            { name: 'EntryDetail', params: { entryId: entry.id } },
          ],
        });
      } catch (navError) {
        logger.error('Navigation after save failed:', navError);
        navigation.navigate('EntryDetail', { entryId: entry.id });
      }
    } catch (error) {
      logger.error('Error saving entry:', error);
      Alert.alert('Error', 'Failed to save entry. Please try again.');
    }
  };

  // Description screen handlers
  const handleDescriptionPress = () => {
    setShowDescriptionScreen(true);
    setDescriptionText(description); // Load existing description if any

    // Animate in with staggered timing
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
        delay: 100, // Staggered appearance
        easing: ANIMATION_CONFIG.easing.easeOut,
        useNativeDriver: true,
      }),
    ]).start();

    // Auto-focus after animation completes
    setTimeout(() => {
      descriptionInputRef.current?.focus();
    }, 350);
  };

  const handleDescriptionClose = () => {
    Keyboard.dismiss();

    // Animate out with staggered timing
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
        delay: 100, // Staggered exit
        easing: ANIMATION_CONFIG.easing.easeOut,
        useNativeDriver: true,
      }),
      Animated.timing(descriptionCloseButtonOpacity, {
        toValue: 0,
        duration: 200,
        easing: ANIMATION_CONFIG.easing.easeOut,
        useNativeDriver: true,
      }),
      Animated.timing(descriptionSaveButtonOpacity, {
        toValue: 0,
        duration: 200,
        easing: ANIMATION_CONFIG.easing.easeOut,
        useNativeDriver: true,
      }),
    ]).start(() => {
      // Reset state after animation completes
      setShowDescriptionScreen(false);
      setDescriptionText(''); // Clear temporary text without saving

      // Reset all animation values for next open
      descriptionSaveButtonOpacity.setValue(0);
      descriptionContainerTranslateY.setValue(100);
      descriptionBlurOpacity.setValue(0);
      descriptionCloseButtonOpacity.setValue(0);
    });
  };

  const handleDescriptionSave = () => {
    if (descriptionText.trim().length === 0) return;

    setDescription(descriptionText.trim()); // Save to permanent state
    Keyboard.dismiss();

    // Same exit animation as close
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
      Animated.timing(descriptionCloseButtonOpacity, {
        toValue: 0,
        duration: 200,
        easing: ANIMATION_CONFIG.easing.easeOut,
        useNativeDriver: true,
      }),
      Animated.timing(descriptionSaveButtonOpacity, {
        toValue: 0,
        duration: 200,
        easing: ANIMATION_CONFIG.easing.easeOut,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setShowDescriptionScreen(false);
      setDescriptionText('');

      // Reset all animation values for next open
      descriptionSaveButtonOpacity.setValue(0);
      descriptionContainerTranslateY.setValue(100);
      descriptionBlurOpacity.setValue(0);
      descriptionCloseButtonOpacity.setValue(0);
    });
  };

  const handleDescriptionTextChange = (text: string) => {
    setDescriptionText(text);

    // Show/hide Save button based on text content
    const hasText = text.trim().length > 0;
    Animated.timing(descriptionSaveButtonOpacity, {
      toValue: hasText ? 1 : 0,
      duration: 200,
      easing: ANIMATION_CONFIG.easing.easeOut,
      useNativeDriver: true,
    }).start();
  };

  const handleBlurOverlayPress = () => {
    // Blur the text input, which dismisses keyboard
    descriptionInputRef.current?.blur();
  };

  /** Reopen title-editing view when user taps the displayed title (Screen 3). Preserves description and emotion. */
  const handleTitleDisplayPress = () => {
    setIsReopeningTitleEdit(true);
    setShowTitleInput(true);
    // Focus after TextInput has mounted (next frame + short delay for layout)
    requestAnimationFrame(() => {
      setTimeout(() => {
        try {
          titleInputRef.current?.focus();
        } catch (err) {
          logger.warn('CaptureScreen: could not focus title input after tap', err);
        }
      }, 50);
    });
  };

  // Capture button press feedback
  const handleCapturePressIn = () => {
    Animated.timing(captureButtonScale, {
      toValue: 0.92,
      duration: 150,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  };

  const handleCapturePressOut = () => {
    Animated.spring(captureButtonScale, {
      toValue: 1,
      ...createSpringConfig(),
      useNativeDriver: true,
    }).start();
  };

  if (!cameraReady) {
    return (
      <View style={styles.container}>
        <Text style={styles.loadingText}>Loading camera...</Text>
      </View>
    );
  }

  if (!permissionGranted && mediaType !== 'audio') {
    return (
      <View style={styles.container}>
        <Text style={styles.loadingText}>Camera permission required</Text>
        <TouchableOpacity
          style={styles.button}
          onPress={async () => {
            if (Camera) {
              const { status } = await Camera.requestCameraPermissionsAsync();
              setPermissionGranted(status === 'granted');
            }
          }}
        >
          <Text style={styles.buttonText}>Grant Permission</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Style objects for camera container
  const imageStyle = {
    width: windowWidth,
    height: 463.033 * scaleFactor,
    left: 0,
    top: 107.07 * scaleFactor - containerTop,
  };

  return (
    <View style={styles.container}>
      {/* Back Button - Hidden while description subfeature is open */}
      {!showDescriptionScreen && (
        <TouchableOpacity
          style={[styles.backButton, {
            top: (Number.isFinite(insets.top) ? insets.top : 0) + SPACING.sm,
            left: 18 * scaleFactor,
            width: 23.75 * scaleFactor,
            height: 26.25 * scaleFactor,
          }]}
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={() => {
            if (photoUri !== null) {
              Alert.alert(
                'Discard photo?',
                'Are you sure you want to go back?',
                [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Yes',
                    onPress: () => {
                      try {
                        navigation.goBack();
                      } catch (e) {
                        logger.warn('Navigation goBack failed', e);
                      }
                    },
                  },
                ]
              );
            } else {
              navigation.goBack();
            }
          }}
        >
          <BackArrow width={23.75 * scaleFactor} height={26.25 * scaleFactor} color={colors.textPrimary} />
        </TouchableOpacity>
      )}

      {/* Main Content Container - Absolute positioning; use available height when keyboard closed */}
      <View style={[styles.contentContainer, {
        top: containerTop,
        height: isKeyboardOpen
          ? Math.max(0, currentPositions.containerHeight - containerBottomInset)
          : Math.max(0, availableHeight),
      }]}>

        {/* Media Type Selector - Only shown before capture */}
        {!hasCapturedMedia && (
          <>
            <TouchableOpacity
              style={[styles.mediaTypeButton, { left: 87 * scaleFactor, top: 599 * scaleFactor - containerTop }]}
              onPress={() => {
                Alert.alert(
                  'Coming Soon',
                  'Audio recording will be available soon!',
                  [{ text: 'OK' }]
                );
              }}
              accessibilityRole="button"
              accessibilityLabel="Audio. Not available in this version."
            >
              <Animated.Text style={[styles.mediaTypeText, mediaType === 'audio' ? styles.mediaTypeTextActive : styles.mediaTypeTextInactive, {
                opacity: mediaTypeAnimations.audio.opacity,
                transform: [{ scale: mediaTypeAnimations.audio.scale }],
              }]}>
                Audio
              </Animated.Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.mediaTypeButton, { left: 172 * scaleFactor, top: 599 * scaleFactor - containerTop }]}
              onPress={() => {
                setMediaType('photo');
                handleRetake();
              }}
              accessibilityRole="button"
              accessibilityLabel="Photo"
              accessibilityState={{ selected: mediaType === 'photo' }}
            >
              <Animated.Text style={[styles.mediaTypeText, mediaType === 'photo' ? styles.mediaTypeTextActive : styles.mediaTypeTextInactive, {
                opacity: mediaTypeAnimations.photo.opacity,
                transform: [{ scale: mediaTypeAnimations.photo.scale }],
              }]}>
                Photo
              </Animated.Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.mediaTypeButton, { left: 257 * scaleFactor, top: 599 * scaleFactor - containerTop }]}
              onPress={() => {
                Alert.alert(
                  'Not available',
                  'Photo capture is available in this version. Audio and video will be added in a future update.',
                  [{ text: 'OK' }]
                );
              }}
              accessibilityRole="button"
              accessibilityLabel="Video. Not available in this version."
            >
              <Animated.Text style={[styles.mediaTypeText, mediaType === 'video' ? styles.mediaTypeTextActive : styles.mediaTypeTextInactive, {
                opacity: mediaTypeAnimations.video.opacity,
                transform: [{ scale: mediaTypeAnimations.video.scale }],
              }]}>
                Video
              </Animated.Text>
            </TouchableOpacity>
          </>
        )}

        {/* Pre-Capture: Camera Container - Full width */}
        {!hasCapturedMedia && (
          <Animated.View style={[styles.cameraContainer, imageStyle]}>
            {mediaType === 'audio' ? (
              <View style={styles.audioContainer}>
                <AudioWaveform isRecording={false} audioLevel={0} />
              </View>
            ) : CameraView ? (
              <>
                <PinchGestureHandler
                  enabled={mediaType === 'photo' && !hasCapturedMedia && permissionGranted}
                  onGestureEvent={handlePinchGesture}
                  onHandlerStateChange={handlePinchStateChange}
                >
                  <View style={styles.camera}>
                    <CameraView
                      key={`${cameraKey}-${facing}-${selectedLens ?? 'default'}`}
                      ref={cameraRef}
                      style={styles.camera}
                      facing={facing}
                      flash={flashMode}
                      zoom={cameraZoom}
                      selectedLens={selectedLens}
                      video={false} // Photo mode
                      onCameraReady={() => {
                        setCameraHardwareReady(true);
                        setCameraMountError(null);
                        // onAvailableLensesChanged is wired to KVO [.new] in the native layer and
                        // never fires on initial load because the device list is already populated
                        // when the observer is attached. Fetch imperatively here to bypass this.
                        cameraRef.current?.getAvailableLensesAsync?.()
                          .then((lenses: string[]) => {
                            if (Array.isArray(lenses) && lenses.length > 0) {
                              setAvailableLenses(lenses);
                            }
                          })
                          .catch((_: any) => {});
                      }}
                      onAvailableLensesChanged={handleAvailableLensesChanged}
                      onMountError={(event: any) => {
                        const message = event?.message ?? event?.nativeEvent?.message ?? 'Unable to start camera preview.';
                        setCameraHardwareReady(false);
                        setCameraMountError(message);
                        logger.error('Camera mount error:', message);
                      }}
                    />
                  </View>
                </PinchGestureHandler>
                {/* Camera controls overlay: swap, flash */}
                {mediaType === 'photo' && (
                  <View
                    style={[
                      styles.cameraControlsOverlay,
                      {
                        paddingBottom: 24 * scaleFactor,
                        paddingHorizontal: 24 * scaleFactor,
                      },
                    ]}
                    pointerEvents="box-none"
                  >
                    <View style={[styles.cameraControlsRow, { alignSelf: 'center', gap: 8 }]}>
                      <TouchableOpacity
                        style={[
                          styles.cameraControlButton,
                          {
                            width: 31 * scaleFactor * cameraControlScale,
                            height: 31 * scaleFactor * cameraControlScale,
                            borderRadius: 15.5 * scaleFactor * cameraControlScale,
                          },
                        ]}
                        onPress={() => {
                          try {
                            setFlashMode((m) => (m === 'on' ? 'off' : 'on'));
                          } catch (_) { }
                        }}
                        activeOpacity={0.7}
                        accessible
                        accessibilityRole="button"
                        accessibilityLabel={flashMode === 'on' ? 'Flash off for next photo' : 'Flash on for next photo'}
                      >
                        <FlashIcon
                          width={13 * scaleFactor * cameraControlScale}
                          height={15 * scaleFactor * cameraControlScale}
                          color={flashMode === 'on' ? '#DEC337' : colors.textPrimary}
                        />
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.zoomToggleButton}
                        onPress={handleZoomButtonPress}
                        activeOpacity={0.8}
                        disabled={!cameraHardwareReady || isPinching}
                        accessibilityRole="button"
                        accessibilityLabel={`Toggle zoom lens, current ${zoomButtonLabel}`}
                      >
                        <Text style={styles.zoomToggleText}>{zoomButtonLabel}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[
                          styles.cameraControlButton,
                          {
                            width: 31 * scaleFactor * cameraControlScale,
                            height: 31 * scaleFactor * cameraControlScale,
                            borderRadius: 15.5 * scaleFactor * cameraControlScale,
                          },
                        ]}
                        onPress={() => {
                          setFacing((f) => (f === 'back' ? 'front' : 'back'));
                        }}
                        activeOpacity={0.7}
                        accessible
                        accessibilityRole="button"
                        accessibilityLabel="Switch camera"
                      >
                        <CameraSwitchIcon
                          width={14 * scaleFactor * cameraControlScale}
                          height={14 * scaleFactor * cameraControlScale}
                          color={colors.textPrimary}
                        />
                      </TouchableOpacity>
                    </View>
                  </View>
                )}

              </>
            ) : (
              <View style={styles.cameraPlaceholder}>
                <Text style={styles.placeholderText}>{cameraMountError ? 'Camera unavailable' : 'Preparing camera…'}</Text>
                {cameraMountError ? <Text style={styles.cameraErrorText}>{cameraMountError}</Text> : null}
              </View>
            )}
          </Animated.View>
        )}

        {/* Capture Button - Absolute positioning */}
        {!hasCapturedMedia && (() => {
          const buttonSize = DIMENSIONS.captureButtonSize * scaleFactor;
          const innerSize = DIMENSIONS.captureButtonInnerSize * scaleFactor;
          return (
            <Animated.View
              style={{
                position: 'absolute',
                left: (windowWidth - buttonSize) / 2,
                top: 644 * scaleFactor - containerTop,
                transform: [{ scale: captureButtonScale }],
              }}
            >
              <TouchableOpacity
                style={[
                  styles.captureButton,
                  {
                    width: buttonSize,
                    height: buttonSize,
                    borderRadius: buttonSize / 2, // Perfect circle
                  }
                ]}
                onPress={handleCapture}
                onPressIn={handleCapturePressIn}
                onPressOut={handleCapturePressOut}
                accessibilityRole="button"
                accessibilityLabel={mediaType === 'photo' ? 'Take photo' : mediaType === 'video' ? 'Record video' : 'Record audio'}
              >
                <Animated.View style={[styles.captureButtonInner, {
                  width: innerSize,
                  height: innerSize,
                  borderRadius: innerSize / 2, // Perfect circle
                }]} />
              </TouchableOpacity>
            </Animated.View>
          );
        })()}

        {/* Post-Capture UI */}
        {hasCapturedMedia && (
          <>
            {/* Captured Image (scaled by imageScaleExtraData when extra-details are shown; adaptive per device width) */}
            <Animated.View style={[styles.capturedImageContainer, {
              width: hasCapturedMedia && !isKeyboardOpen
                ? currentPositions.imageWidth * imageScaleExtraData
                : currentPositions.imageWidth,
              height: hasCapturedMedia && !isKeyboardOpen
                ? currentPositions.imageHeight * imageScaleExtraData
                : currentPositions.imageHeight,
              left: hasCapturedMedia && !isKeyboardOpen
                ? (windowWidth - (currentPositions.imageWidth * imageScaleExtraData)) / 2
                : currentPositions.imageLeft,
              top: currentPositions.imageTop, // Maintain top positioning
              zIndex: 1,
              transform: [
                { scale: imageScale },
                { translateY: imageTranslateY },
              ],
            }]}>

              {photoUri ? (
                <Image source={{ uri: photoUri }} style={styles.capturedImage} />
              ) : audioUri ? (
                <View style={styles.audioContainer}>
                  <AudioWaveform isRecording={false} audioLevel={0} />
                </View>
              ) : null}
            </Animated.View>

            {/* Photo Flash Overlay */}
            {mediaType === 'photo' && photoUri && (
              <Animated.View style={[styles.photoFlash, {
                top: currentPositions.imageTop,
                left: currentPositions.imageLeft,
                width: currentPositions.imageWidth,
                height: currentPositions.imageHeight,
                opacity: photoFlashOpacity,
              }]} />
            )}

            {/* Title TextInput - Show when user tapped "Add a title..." or title to edit */}
            {hasCapturedMedia && showTitleInput && (!(hasTitle && !isKeyboardOpen) || isReopeningTitleEdit) && (
              <TextInput
                ref={titleInputRef}
                value={title}
                onChangeText={setTitle}
                placeholder="Add a title..."
                placeholderTextColor={colors.borderLight}
                style={[styles.titleInput, {
                  top: isKeyboardOpen
                    ? (currentPositions as any).titleInputTop
                    : positionsClosed.titleTextTop,
                  left: isKeyboardOpen
                    ? (currentPositions as any).titleInputLeft
                    : positionsClosed.titleTextLeft,
                  width: isKeyboardOpen
                    ? (currentPositions as any).titleInputWidth
                    : positionsClosed.titleTextWidth,
                  fontSize: 20 * scaleFactor,
                }]}
                autoCorrect={false}
                autoCapitalize="none"
                blurOnSubmit={true}
                returnKeyType="done"
                multiline={false}
                autoFocus={false}
                textAlignVertical="center"
                onSubmitEditing={() => {
                  // Dismiss keyboard when user presses "done" button
                  Keyboard.dismiss();
                  titleInputRef.current?.blur();
                }}
              />
            )}

            {/* Screen 2: Image tap area to dismiss keyboard */}
            {hasCapturedMedia && showTitleInput && isKeyboardOpen && (
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

            {/* Extra-details screen - single-layer ScrollView that sits above the image (zIndex: 2).
                bounces={false} prevents content from over-scrolling into the image area above. */}
            {hasCapturedMedia && !isKeyboardOpen && !isReopeningTitleEdit && (
              <ScrollView
                style={{
                  position: 'absolute',
                  top: imageBottomScreen3,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  zIndex: 2,
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
                {/* Title display — "Add a title..." or title (Figma: below image) */}
                <TouchableOpacity
                  style={[styles.titleDisplayText, styles.titleDisplayTouchable, { position: 'relative', marginTop: SPACING.md }]}
                  onPress={handleTitleDisplayPress}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel={hasTitle ? 'Edit title' : 'Add a title'}
                >
                  <Text style={[styles.titleDisplayText, { fontSize: 20 * scaleFactor, width: '100%', color: hasTitle ? colors.textPrimary : colors.textSecondary }]}>
                    {hasTitle ? title : 'Add A Title...'}
                  </Text>
                </TouchableOpacity>

                {/* "Add more details:" — Figma layout */}
                <Animated.Text style={[styles.addMoreInfoText, {
                  position: 'relative',
                  marginTop: SPACING.md,
                  fontSize: 12 * scaleFactor,
                  opacity: addMoreInfoOpacity,
                  transform: [{ translateY: addMoreInfoTranslateY }],
                }]}>
                  Add more details:
                </Animated.Text>

                {/* Two rows: Row 1 Description + Emotion; Row 2 Bookmark centered */}
                <Animated.View
                  style={{
                    marginTop: SPACING.sm,
                    alignSelf: 'center',
                    width: positionsClosed.imageWidth,
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 10 * scaleFactor,
                  }}
                >
                  <Animated.View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8 * scaleFactor }}>
                    <Animated.View style={{ opacity: descriptionButtonOpacity, transform: [{ translateY: descriptionButtonTranslateY }] }}>
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
                    </Animated.View>
                    <Animated.View style={{ opacity: emotionButtonOpacity, transform: [{ translateY: emotionButtonTranslateY }] }}>
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
                            returnFrom: 'Capture',
                            initialLabels: emotionLabels,
                          })
                        }
                        activeOpacity={0.7}
                        accessibilityRole="button"
                        accessibilityLabel="Open emotion capture"
                      >
                        <HeartIcon width={13 * scaleFactor} height={13 * scaleFactor} color={colors.textPrimary} />
                        <Text style={[styles.actionButtonText, { fontSize: 13 * scaleFactor }]}>Emotion</Text>
                      </TouchableOpacity>
                    </Animated.View>
                  </Animated.View>
                  <Animated.View style={{ opacity: aweButtonOpacity, transform: [{ translateY: aweButtonTranslateY }] }}>
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
                      onPress={() => setIsAweTagged(prev => !prev)}
                      activeOpacity={0.7}
                      accessibilityRole="button"
                      accessibilityLabel="Toggle bookmark"
                      accessibilityState={{ selected: isAweTagged }}
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
                  </Animated.View>
                </Animated.View>

                {/* SAVE Button — below action buttons with gap; paddingBottom in contentContainer keeps it above safe area */}
                <TouchableOpacity
                  style={[styles.saveButton, {
                    position: 'relative',
                    marginTop: SPACING.md,
                    alignSelf: 'center',
                    width: windowWidth - 49 * scaleFactor,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }]}
                  onPress={handleSave}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel="Save entry"
                >
                  <GradientText
                    style={[styles.saveButtonText, { fontSize: 25 * scaleFactor }]}
                  >
                    SAVE
                  </GradientText>
                </TouchableOpacity>
              </ScrollView>
            )}

            {/* Description Screen Overlay */}
            {showDescriptionScreen && (
              <>
                {/* Background Blur Overlay */}
                <Animated.View
                  style={[styles.descriptionBlurOverlay, {
                    opacity: descriptionBlurOpacity,
                  }]}
                >
                  <TouchableOpacity
                    style={styles.blurTouchable}
                    activeOpacity={1}
                    onPress={handleBlurOverlayPress}
                    accessibilityRole="button"
                    accessibilityLabel="Dismiss description"
                  />
                </Animated.View>

                {/* Description Container — full height like emotion feature */}
                <Animated.View
                  style={[styles.descriptionContainer, {
                    transform: [{ translateY: descriptionContainerTranslateY }],
                    height: '100%',
                    paddingTop: Math.max(28, Math.round(0.06 * Dimensions.get('window').height) - SPACING.sm),
                    paddingBottom: (Number.isFinite(insets.bottom) ? insets.bottom : 0) + 20,
                  }]}
                >
                  {/* Close Button (X) */}
                  <Animated.View style={{ opacity: descriptionCloseButtonOpacity }}>
                    <TouchableOpacity
                      style={styles.descriptionCloseButton}
                      onPress={handleDescriptionClose}
                      activeOpacity={0.7}
                      accessibilityRole="button"
                      accessibilityLabel="Close description"
                    >
                      <Text style={styles.descriptionCloseText}>×</Text>
                    </TouchableOpacity>
                  </Animated.View>

                  {/* Text Input Wrapper */}
                  <View style={styles.textInputWrapper}>
                    <TextInput
                      ref={descriptionInputRef}
                      style={styles.descriptionTextInput}
                      placeholder="Write A Description..."
                      placeholderTextColor={colors.textSecondary}
                      value={descriptionText}
                      onChangeText={handleDescriptionTextChange}
                      multiline
                      autoFocus={false}
                      returnKeyType="done"
                      maxLength={500}
                      textAlignVertical="top"
                    />
                  </View>

                  {/* Save Button */}
                  <Animated.View style={{ opacity: descriptionSaveButtonOpacity }}>
                    <TouchableOpacity
                      style={[
                        styles.descriptionSaveButton,
                        { bottom: isKeyboardOpen ? 50 : (Number.isFinite(insets.bottom) ? insets.bottom : 0) + BOTTOM_SAFE_BUFFER }
                      ]}
                      onPress={handleDescriptionSave}
                      disabled={descriptionText.trim().length === 0}
                      activeOpacity={0.7}
                      accessibilityRole="button"
                      accessibilityLabel="Save description"
                      accessibilityState={{ disabled: descriptionText.trim().length === 0 }}
                    >
                      <Text style={styles.descriptionSaveButtonText}>Save</Text>
                    </TouchableOpacity>
                  </Animated.View>
                </Animated.View>
              </>
            )}

          </>
        )}

      </View>

    </View>
  );
};

function createCaptureStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    contentContainer: { position: 'absolute', left: 0, right: 0, backgroundColor: colors.background, zIndex: 1 },
    backButton: { position: 'absolute', zIndex: 100, justifyContent: 'center', alignItems: 'center' },
    loadingText: { ...TEXT_STYLES.entryInput, textAlign: 'center', marginTop: SPACING.xxl },
    mediaTypeButton: { position: 'absolute', justifyContent: 'center', alignItems: 'center' },
    mediaTypeText: { fontFamily: FONTS.inter, fontSize: 15, fontWeight: FONT_WEIGHTS.regular },
    mediaTypeTextActive: { color: colors.textPrimary },
    mediaTypeTextInactive: { color: colors.stone600 },
    cameraContainer: {
      position: 'absolute',
      backgroundColor: colors.stone600,
      borderRadius: 7,
      borderWidth: 2,
      borderColor: colors.borderLight,
      overflow: 'hidden',
    },
    camera: { width: '100%', height: '100%' },
    cameraControlsOverlay: { position: 'absolute', bottom: 0, left: 0, right: 0, justifyContent: 'flex-end' },
    cameraControlsRow: { flexDirection: 'row', alignItems: 'center' },
    cameraControlButton: { backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
    cameraControlText: { fontFamily: FONTS.inter, fontWeight: FONT_WEIGHTS.semibold, color: colors.textPrimary },
    zoomToggleButton: {
      minWidth: 58,
      paddingHorizontal: 10,
      paddingVertical: 7,
      borderRadius: 16,
      backgroundColor: 'rgba(0,0,0,0.5)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    zoomToggleText: {
      fontFamily: FONTS.inter,
      fontSize: 17,
      fontWeight: FONT_WEIGHTS.semibold,
      color: colors.textPrimary,
    },
    capturedImage: { width: '100%', height: '100%', resizeMode: 'cover' },
    audioContainer: { width: '100%', height: '100%', justifyContent: 'center', alignItems: 'center', backgroundColor: colors.black },
    cameraPlaceholder: {
      width: '100%',
      height: '100%',
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: colors.stone600,
    },
    placeholderText: { fontFamily: FONTS.inter, fontSize: 15, fontWeight: FONT_WEIGHTS.regular, color: colors.textPrimary },
    cameraErrorText: {
      marginTop: 8,
      paddingHorizontal: 16,
      textAlign: 'center',
      fontFamily: FONTS.inter,
      fontSize: 12,
      color: colors.textSecondary,
    },
    captureButton: {
      position: 'absolute',
      backgroundColor: colors.zinc300,
      justifyContent: 'center',
      alignItems: 'center',
      borderWidth: 0.5,
      borderColor: colors.borderLight,
    },
    captureButtonInner: {
      backgroundColor: colors.zinc300,
      borderWidth: 1,
      borderColor: colors.background,
    },
    captureButtonInnerRecording: { backgroundColor: COLORS.redRecording },
    captureButtonDisabled: { opacity: 0.5 },
    button: {
      backgroundColor: colors.buttonGray,
      paddingVertical: 12,
      paddingHorizontal: 24,
      borderRadius: 8,
      marginTop: 16,
    },
    buttonText: {
      fontFamily: FONTS.inter,
      fontSize: 16,
      fontWeight: FONT_WEIGHTS.semibold,
      color: colors.textPrimary,
      textAlign: 'center',
    },
    capturedImageContainer: {
      position: 'absolute',
      backgroundColor: colors.stone600,
      borderRadius: 7,
      borderWidth: 2,
      borderColor: colors.borderLight,
      overflow: 'hidden',
    },
    photoFlash: { position: 'absolute', backgroundColor: colors.white, pointerEvents: 'none' },
    titlePromptContainer: { position: 'absolute', justifyContent: 'center', alignItems: 'center' },
    titlePromptText: {
      fontFamily: FONTS.inter,
      fontSize: 20,
      fontWeight: FONT_WEIGHTS.semibold,
      color: colors.borderLight,
      textAlign: 'center',
    },
    titleInput: {
      position: 'absolute',
      fontFamily: FONTS.inter,
      fontSize: 20,
      fontWeight: FONT_WEIGHTS.semibold,
      color: colors.borderLight,
      textAlign: 'center',
      backgroundColor: 'transparent',
      paddingVertical: 0,
      paddingHorizontal: 0,
    },
    imageTapArea: { position: 'absolute', backgroundColor: 'transparent', zIndex: 5 },
    titleDisplayText: {
      position: 'absolute',
      fontFamily: FONTS.inter,
      fontWeight: FONT_WEIGHTS.semibold,
      color: colors.borderLight,
      textAlign: 'center',
    },
    titleDisplayTouchable: { justifyContent: 'center' },
    addMoreInfoText: {
      position: 'absolute',
      textAlign: 'center',
      fontFamily: FONTS.inter,
      fontWeight: FONT_WEIGHTS.regular,
      color: colors.textSecondary,
    },
    actionButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'transparent',
      borderWidth: 1,
      borderColor: colors.textPrimary,
    },
    aweTagButtonTitle: { position: 'absolute', flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
    aweTagButtonText: { fontFamily: FONTS.inter, fontWeight: FONT_WEIGHTS.bold, marginLeft: 8 },
    skipTouchable: { position: 'absolute', paddingVertical: 4, paddingHorizontal: 8, zIndex: 5 },
    skipText: { fontFamily: FONTS.inter, fontSize: 13, color: colors.infoTextGray },
    actionButtonText: {
      fontFamily: FONTS.inter,
      fontSize: 15,
      fontWeight: FONT_WEIGHTS.bold,
      color: colors.textPrimary,
    },
    saveButton: { position: 'absolute', alignItems: 'center', justifyContent: 'center', zIndex: 10 },
    saveButtonText: { fontFamily: FONTS.inter, fontWeight: FONT_WEIGHTS.black, textAlign: 'center' },
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
    textInputWrapper: { flex: 1, marginTop: 24, marginBottom: 110 },
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
    aura: { margin: -5 },
  });
}

export default CaptureScreen;
