// CaptureScreen
// Live camera with multi-photo capture (max 3). Switches to CaptureReviewView inline when user taps Next.

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import CaptureReviewView from '../components/capture/CaptureReviewView';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Platform,
  Animated,
  Easing,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  PinchGestureHandler,
  State as GestureState,
  type PinchGestureHandlerGestureEvent,
  type PinchGestureHandlerStateChangeEvent,
} from 'react-native-gesture-handler';
import { RootStackParamList } from '../navigation/types';
import { COLORS, SPACING, FONTS, FONT_WEIGHTS, DIMENSIONS } from '../config/constants';
import { useTheme } from '../context/ThemeContext';
import type { ThemeColors } from '../config/theme';
import BackArrow from '../components/common/icons/BackArrow';
import FlashIcon from '../components/common/icons/FlashIcon';
import CameraSwitchIcon from '../components/common/icons/CameraSwitchIcon';
import { createSpringConfig } from '../utils/animations';
import { logger } from '../utils/logger';

type CaptureScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, 'Capture'>;

type Phase = 'camera' | 'review';
type ZoomPreset = '0.5x' | '1x' | 'custom';

const MAX_PHOTOS = 3;
const ZOOM_MIN = 0;
const ZOOM_MAX = 1;
const ZOOM_SENSITIVITY = 0.35;
const PINCH_DEAD_ZONE = 0.015;
const PINCH_UPDATE_INTERVAL_MS = 16;

const CaptureScreen: React.FC = () => {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<CaptureScreenNavigationProp>();

  // Camera state
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraHardwareReady, setCameraHardwareReady] = useState(false);
  const [permissionGranted, setPermissionGranted] = useState(false);
  const [facing, setFacing] = useState<'back' | 'front'>('back');
  const [flashMode, setFlashMode] = useState<'off' | 'on' | 'auto'>('off');
  const [cameraZoom, setCameraZoom] = useState<number>(0);
  const [activeZoomPreset, setActiveZoomPreset] = useState<ZoomPreset>('1x');
  const [availableLenses, setAvailableLenses] = useState<string[]>([]);
  const [selectedLens, setSelectedLens] = useState<string | undefined>(undefined);
  const [cameraMountError, setCameraMountError] = useState<string | null>(null);
  const [isPinching, setIsPinching] = useState(false);

  // Phase: 'camera' shows the live camera; 'review' renders CaptureReviewView inline
  const [phase, setPhase] = useState<Phase>('camera');

  // Multi-photo accumulation
  const [capturedPhotos, setCapturedPhotos] = useState<string[]>([]);
  const hasPhotos = capturedPhotos.length > 0;
  const atLimit = capturedPhotos.length >= MAX_PHOTOS;

  // Lazy-loaded modules
  const [CameraView, setCameraViewModule] = useState<any>(null);
  const [Camera, setCameraModule] = useState<any>(null);
  const cameraRef = useRef<any>(null);
  const cameraZoomRef = useRef(0);
  const pinchStartZoomRef = useRef(0);
  const lastPinchUpdateRef = useRef(0);

  // Animation values
  const captureButtonScale = useRef(new Animated.Value(1)).current;
  // Prevent re-entrant captures (async takePictureAsync)
  const isCapturingRef = useRef(false);

  const styles = useMemo(() => createStyles(colors), [colors]);
  const { width: windowWidth } = useWindowDimensions();
  const scaleFactor = Math.min(Math.max(windowWidth, 320), 430) / 390;
  const cameraControlScale = 1.2;
  const containerTop = insets.top + 74 * scaleFactor;

  // ─── Zoom helpers ──────────────────────────────────────────────────────────

  useEffect(() => {
    cameraZoomRef.current = cameraZoom;
  }, [cameraZoom]);

  const clampZoom = useCallback((value: number) => {
    if (!Number.isFinite(value)) return cameraZoomRef.current;
    return Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, value));
  }, []);

  const supportsPreset = useCallback((preset: Exclude<ZoomPreset, 'custom'>) => {
    if (facing !== 'back') return preset === '1x';
    if (Platform.OS !== 'ios') return preset !== '0.5x';
    if (!availableLenses.length) return true;
    const lowerLenses = availableLenses.map(l => l.toLowerCase());
    if (preset === '0.5x') return lowerLenses.some(l => l.includes('ultra'));
    return true;
  }, [availableLenses, facing]);

  const getLensByKeyword = useCallback((includeKeywords: string[], excludeKeywords: string[] = []) => {
    const lowerInclude = includeKeywords.map(k => k.toLowerCase());
    const lowerExclude = excludeKeywords.map(k => k.toLowerCase());
    return availableLenses.find(lens => {
      const lower = lens.toLowerCase();
      return lowerInclude.some(k => lower.includes(k)) && !lowerExclude.some(k => lower.includes(k));
    });
  }, [availableLenses]);

  const setZoomSafely = useCallback((nextZoom: number) => {
    setCameraZoom(clampZoom(nextZoom));
  }, [clampZoom]);

  const applyZoomPreset = useCallback((preset: Exclude<ZoomPreset, 'custom'>) => {
    if (!cameraHardwareReady || !permissionGranted) return;

    if (facing !== 'back') {
      setSelectedLens(undefined);
      setZoomSafely(0);
      setActiveZoomPreset('1x');
      return;
    }

    if (Platform.OS === 'ios') {
      const ultraWideLens = getLensByKeyword(['ultra']);
      const physicalWideLens = availableLenses.find(l => {
        const lower = l.toLowerCase();
        return !lower.includes('ultra') && !lower.includes('dual') &&
               !lower.includes('triple') && !lower.includes('tele');
      });

      if (preset === '0.5x') {
        setSelectedLens(ultraWideLens ?? undefined);
        setActiveZoomPreset('0.5x');
        setZoomSafely(0);
        return;
      }
      setSelectedLens(physicalWideLens);
      setActiveZoomPreset('1x');
      setZoomSafely(0);
      return;
    }

    setActiveZoomPreset(preset);
    setZoomSafely(0);
  }, [cameraHardwareReady, permissionGranted, facing, availableLenses, getLensByKeyword, setZoomSafely]);

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
    if (!cameraHardwareReady || !permissionGranted) return;
    if (!supportsPreset('0.5x')) { applyZoomPreset('1x'); return; }
    applyZoomPreset(activeZoomPreset === '0.5x' ? '1x' : '0.5x');
  }, [cameraHardwareReady, permissionGranted, supportsPreset, applyZoomPreset, activeZoomPreset]);

  const handlePinchGesture = useCallback((event: PinchGestureHandlerGestureEvent) => {
    if (!cameraHardwareReady || !permissionGranted) return;
    const now = Date.now();
    if (now - lastPinchUpdateRef.current < PINCH_UPDATE_INTERVAL_MS) return;
    lastPinchUpdateRef.current = now;

    const scale = event.nativeEvent.scale;
    if (!Number.isFinite(scale)) return;
    const scaleDelta = scale - 1;
    if (Math.abs(scaleDelta) <= PINCH_DEAD_ZONE) return;

    const unclampedZoom = pinchStartZoomRef.current + scaleDelta * ZOOM_SENSITIVITY;
    const targetZoom = clampZoom(unclampedZoom);

    if (Platform.OS === 'ios' && facing === 'back') {
      const currentLensIsUltraWide = selectedLens?.toLowerCase().includes('ultra') ?? false;

      if (currentLensIsUltraWide && unclampedZoom > ZOOM_MAX) {
        setSelectedLens(undefined);
        setCameraZoom(0);
        cameraZoomRef.current = 0;
        pinchStartZoomRef.current = 0;
        setActiveZoomPreset('1x');
        return;
      }
      if (!currentLensIsUltraWide && unclampedZoom < ZOOM_MIN) {
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

    if (Math.abs(targetZoom - cameraZoomRef.current) < 0.002) return;
    setCameraZoom(targetZoom);
    setActiveZoomPreset('custom');
  }, [cameraHardwareReady, permissionGranted, facing, selectedLens, getLensByKeyword, clampZoom]);

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
    const nextLenses = Array.isArray(rawLenses) ? rawLenses.filter(l => typeof l === 'string') : [];
    setAvailableLenses(nextLenses);
  }, []);

  // Late-bind selected lens when list arrives
  useEffect(() => {
    if (!availableLenses.length || facing !== 'back') return;
    if (activeZoomPreset === '0.5x') {
      const ultraWideLens = availableLenses.find(l => l.toLowerCase().includes('ultra'));
      if (ultraWideLens && selectedLens !== ultraWideLens) setSelectedLens(ultraWideLens);
      return;
    }
    if (activeZoomPreset === '1x') {
      const physicalWide = availableLenses.find(l => {
        const lower = l.toLowerCase();
        return !lower.includes('ultra') && !lower.includes('dual') &&
               !lower.includes('triple') && !lower.includes('tele');
      });
      if (physicalWide && selectedLens !== physicalWide) setSelectedLens(physicalWide);
    }
  }, [availableLenses, facing, activeZoomPreset, selectedLens]);

  // Reset camera state on facing change
  useEffect(() => {
    setCameraHardwareReady(false);
    setCameraMountError(null);
    setCameraZoom(0);
    setActiveZoomPreset('1x');
    setSelectedLens(undefined);
    setAvailableLenses([]);
  }, [facing]);

  // Lazy-load expo-camera
  useEffect(() => {
    const loadModules = async () => {
      try {
        const cameraModule = await import('expo-camera');
        setCameraViewModule(() => cameraModule.CameraView);
        setCameraModule(() => cameraModule.Camera);
        setCameraReady(true);
        const { status } = await cameraModule.Camera.requestCameraPermissionsAsync();
        setPermissionGranted(status === 'granted');
      } catch (error) {
        logger.error('Failed to load camera:', error);
        Alert.alert('Error', 'Camera is not available');
      }
    };
    loadModules();
  }, []);

  // ─── Capture button animations ─────────────────────────────────────────────

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

  // ─── Actions ───────────────────────────────────────────────────────────────

  const handleCapture = async () => {
    if (atLimit || isCapturingRef.current) return;
    if (!cameraRef.current || !permissionGranted || !cameraHardwareReady) return;

    isCapturingRef.current = true;
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.8, base64: false });
      if (photo?.uri) {
        const newPhotos = [...capturedPhotos, photo.uri];
        setCapturedPhotos(newPhotos);
        if (newPhotos.length >= MAX_PHOTOS) {
          setPhase('review');
        }
      } else {
        Alert.alert('Error', 'Failed to capture photo');
      }
    } catch (error) {
      logger.error('Error capturing photo:', error);
      Alert.alert('Error', 'Failed to capture photo. Please try again.');
    } finally {
      isCapturingRef.current = false;
    }
  };

  const handleBack = () => {
    if (hasPhotos) {
      Alert.alert(
        'Discard photos?',
        `You have ${capturedPhotos.length} photo${capturedPhotos.length > 1 ? 's' : ''}. Go back and discard them?`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Discard', style: 'destructive', onPress: () => navigation.goBack() },
        ]
      );
    } else {
      navigation.goBack();
    }
  };

  const handleNext = () => {
    if (!hasPhotos) return;
    setPhase('review');
  };

  // ─── Loading / permission states ───────────────────────────────────────────

  if (!cameraReady) {
    return (
      <View style={styles.container}>
        <Text style={styles.loadingText}>Loading camera...</Text>
      </View>
    );
  }

  if (!permissionGranted) {
    return (
      <View style={styles.container}>
        <Text style={styles.loadingText}>Camera permission required</Text>
        <TouchableOpacity
          style={styles.permissionButton}
          onPress={async () => {
            if (Camera) {
              const { status } = await Camera.requestCameraPermissionsAsync();
              setPermissionGranted(status === 'granted');
            }
          }}
        >
          <Text style={styles.permissionButtonText}>Grant Permission</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (phase === 'review') {
    return (
      <CaptureReviewView
        photos={capturedPhotos}
        onBack={(remaining) => {
          setCapturedPhotos(remaining);
          setCameraHardwareReady(false);
          setPhase('camera');
        }}
        onSaved={(entryId, previewFirstPhotoUri) => {
          navigation.reset({
            index: 1,
            routes: [
              { name: 'MainTabs' },
              {
                name: 'CaptureSaved',
                params: previewFirstPhotoUri ? { entryId, previewFirstPhotoUri } : { entryId },
              },
            ],
          });
        }}
      />
    );
  }

  // ─── Layout constants ──────────────────────────────────────────────────────

  const imageStyle = {
    width: windowWidth,
    height: 463.033 * scaleFactor,
    left: 0,
    top: 107.07 * scaleFactor - containerTop,
  };

  const buttonSize = DIMENSIONS.captureButtonSize * scaleFactor;
  const innerSize = DIMENSIONS.captureButtonInnerSize * scaleFactor;
  const captureButtonTop = 644 * scaleFactor - containerTop;

  return (
    <View style={styles.container}>
      {/* Back button */}
      <TouchableOpacity
        style={[styles.backButton, {
          top: (Number.isFinite(insets.top) ? insets.top : 0) + SPACING.sm,
          left: 18 * scaleFactor,
        }]}
        accessibilityRole="button"
        accessibilityLabel="Back"
        onPress={handleBack}
      >
        <BackArrow width={23.75 * scaleFactor} height={26.25 * scaleFactor} color={colors.textPrimary} />
      </TouchableOpacity>

      {/* Main content */}
      <View style={[styles.contentContainer, { top: containerTop }]}>

        {/* Camera */}
        <Animated.View style={[styles.cameraContainer, imageStyle]}>
          {CameraView ? (
            <>
              <PinchGestureHandler
                enabled={permissionGranted}
                onGestureEvent={handlePinchGesture}
                onHandlerStateChange={handlePinchStateChange}
              >
                <View style={styles.camera}>
                  <CameraView
                    key={`camera-${facing}`}
                    ref={cameraRef}
                    style={styles.camera}
                    facing={facing}
                    flash={flashMode}
                    zoom={cameraZoom}
                    selectedLens={selectedLens}
                    video={false}
                    onCameraReady={() => {
                      setCameraHardwareReady(true);
                      setCameraMountError(null);
                      cameraRef.current?.getAvailableLensesAsync?.()
                        .then((lenses: string[]) => {
                          if (Array.isArray(lenses) && lenses.length > 0) setAvailableLenses(lenses);
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

              {/* Camera controls overlay */}
              <View
                style={[styles.cameraControlsOverlay, { paddingBottom: 24 * scaleFactor, paddingHorizontal: 24 * scaleFactor }]}
                pointerEvents="box-none"
              >
                <View style={[styles.cameraControlsRow, { gap: 8 }]}>
                  <TouchableOpacity
                    style={[styles.cameraControlButton, {
                      width: 31 * scaleFactor * cameraControlScale,
                      height: 31 * scaleFactor * cameraControlScale,
                      borderRadius: 15.5 * scaleFactor * cameraControlScale,
                    }]}
                    onPress={() => setFlashMode(m => m === 'on' ? 'off' : 'on')}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityLabel={flashMode === 'on' ? 'Flash off' : 'Flash on'}
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
                    accessibilityLabel={`Zoom: ${zoomButtonLabel}`}
                  >
                    <Text style={styles.zoomToggleText}>{zoomButtonLabel}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.cameraControlButton, {
                      width: 31 * scaleFactor * cameraControlScale,
                      height: 31 * scaleFactor * cameraControlScale,
                      borderRadius: 15.5 * scaleFactor * cameraControlScale,
                    }]}
                    onPress={() => setFacing(f => f === 'back' ? 'front' : 'back')}
                    activeOpacity={0.7}
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
            </>
          ) : (
            <View style={styles.cameraPlaceholder}>
              <Text style={styles.placeholderText}>
                {cameraMountError ? 'Camera unavailable' : 'Preparing camera…'}
              </Text>
              {cameraMountError && (
                <Text style={styles.cameraErrorText}>{cameraMountError}</Text>
              )}
            </View>
          )}
        </Animated.View>

        {/* Bottom bar: [count badge] [shutter] [Next →] */}
        <View style={[styles.bottomBar, { top: captureButtonTop }]}>

          {/* Count badge — left slot */}
          <View style={styles.bottomBarSide}>
            {hasPhotos && (
              <View style={styles.countBadge}>
                <Text style={styles.countBadgeText}>{capturedPhotos.length}</Text>
              </View>
            )}
          </View>

          {/* Shutter button — center */}
          <Animated.View style={{ transform: [{ scale: captureButtonScale }] }}>
            <TouchableOpacity
              style={[
                styles.captureButton,
                { width: buttonSize, height: buttonSize, borderRadius: buttonSize / 2 },
              ]}
              onPress={handleCapture}
              onPressIn={handleCapturePressIn}
              onPressOut={handleCapturePressOut}
              accessibilityRole="button"
              accessibilityLabel="Take photo"
            >
              <View style={[styles.captureButtonInner, {
                width: innerSize,
                height: innerSize,
                borderRadius: innerSize / 2,
              }]} />
            </TouchableOpacity>
          </Animated.View>

          {/* Next button — right slot */}
          <View style={styles.bottomBarSide}>
            {hasPhotos && (
              <TouchableOpacity
                style={styles.nextButton}
                onPress={handleNext}
                accessibilityRole="button"
                accessibilityLabel="Next, review photos"
                activeOpacity={0.7}
              >
                <Text
                  style={styles.nextButtonText}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.85}
                >
                  Next →
                </Text>
              </TouchableOpacity>
            )}
          </View>

        </View>

      </View>
    </View>
  );
};

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    contentContainer: { position: 'absolute', left: 0, right: 0, bottom: 0 },
    backButton: { position: 'absolute', zIndex: 100, justifyContent: 'center', alignItems: 'center' },
    loadingText: {
      fontFamily: FONTS.inter,
      fontSize: 15,
      color: colors.textPrimary,
      textAlign: 'center',
      marginTop: 120,
    },
    permissionButton: {
      backgroundColor: colors.buttonGray,
      paddingVertical: 12,
      paddingHorizontal: 24,
      borderRadius: 8,
      marginTop: 16,
      alignSelf: 'center',
    },
    permissionButtonText: {
      fontFamily: FONTS.inter,
      fontSize: 16,
      fontWeight: FONT_WEIGHTS.semibold,
      color: colors.textPrimary,
      textAlign: 'center',
    },
    cameraContainer: {
      position: 'absolute',
      backgroundColor: colors.stone600,
      borderRadius: 7,
      borderWidth: 2,
      borderColor: colors.borderLight,
      overflow: 'hidden',
    },
    camera: { width: '100%', height: '100%' },
    cameraControlsOverlay: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      justifyContent: 'flex-end',
    },
    cameraControlsRow: { flexDirection: 'row', alignItems: 'center', alignSelf: 'center' },
    cameraControlButton: {
      backgroundColor: 'rgba(0,0,0,0.5)',
      alignItems: 'center',
      justifyContent: 'center',
    },
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
    cameraPlaceholder: {
      width: '100%',
      height: '100%',
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: colors.stone600,
    },
    placeholderText: {
      fontFamily: FONTS.inter,
      fontSize: 15,
      fontWeight: FONT_WEIGHTS.regular,
      color: colors.textPrimary,
    },
    cameraErrorText: {
      marginTop: 8,
      paddingHorizontal: 16,
      textAlign: 'center',
      fontFamily: FONTS.inter,
      fontSize: 12,
      color: colors.textSecondary,
    },
    bottomBar: {
      position: 'absolute',
      left: 0,
      right: 0,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 32,
    },
    bottomBarSide: {
      width: 74,
      alignItems: 'center',
      justifyContent: 'center',
    },
    nextButton: {
      width: '100%',
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 2,
    },
    captureButton: {
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
    captureButtonDisabled: { opacity: 0.4 },
    countBadge: {
      width: 44,
      height: 44,
      borderRadius: 10,
      backgroundColor: 'rgba(255,255,255,0.15)',
      borderWidth: 1,
      borderColor: colors.borderLight,
      alignItems: 'center',
      justifyContent: 'center',
    },
    countBadgeText: {
      fontFamily: FONTS.inter,
      fontSize: 18,
      fontWeight: FONT_WEIGHTS.bold,
      color: colors.textPrimary,
    },
    nextButtonText: {
      fontFamily: FONTS.inter,
      fontSize: 14,
      fontWeight: FONT_WEIGHTS.semibold,
      color: colors.textPrimary,
      textAlign: 'center',
    },
  });
}

export default CaptureScreen;
