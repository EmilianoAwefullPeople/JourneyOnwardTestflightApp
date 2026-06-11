import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import {
  View,
  TouchableOpacity,
  StyleSheet,
  useWindowDimensions,
  KeyboardAvoidingView,
  Platform,
  TextInput,
  Alert,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import AppText from '../components/common/AppText';
import PhotoPickerSheet from '../components/postcards/PhotoPickerSheet';
import { useTheme } from '../context/ThemeContext';
import { useAppContext } from '../context/AppContext';
import { Entry } from '../models/Entry';
import {
  DEFAULT_POSTCARD_PHOTO_TRANSFORM,
  type PostcardPhotoTransform,
  type Postcard,
} from '../models/Postcard';
import { RootStackParamList } from '../navigation/types';
import { FONTS, FONT_WEIGHTS, SPACING } from '../config/constants';
import { generateUUID } from '../utils/uuid';
import { logger } from '../utils/logger';
import { getTemplateById } from '../config/templateRegistry';
import type { TemplateSlot } from '../components/postcards/templates/sharedTypes';

type Props = NativeStackScreenProps<RootStackParamList, 'PostcardEditor'>;

type RatioKey = '1:1' | '4:5' | '9:16';

const RATIO_OPTIONS: { label: RatioKey; value: number }[] = [
  { label: '1:1', value: 1 },
  { label: '4:5', value: 4 / 5 },
  { label: '9:16', value: 9 / 16 },
];

const BADGE_TYPE_OPTIONS = ['temperature', 'altitude', 'weather', 'date', 'place'];

/** forwardRef/memo exports are objects with $$typeof, not `typeof === 'function'`. */
function isRenderableComponentType(c: unknown): c is React.ComponentType<any> {
  if (c == null) return false;
  if (typeof c === 'function') return true;
  return typeof c === 'object' && '$$typeof' in c;
}

// Heavy deps (Reanimated, view-shot, media library) are not imported at module scope — see useEffect / handleDownload.

interface TextEditOverlayProps {
  value: string;
  onChange: (text: string) => void;
  onDone: () => void;
}

const TextEditOverlay: React.FC<TextEditOverlayProps> = ({ value, onChange, onDone }) => {
  const insets = useSafeAreaInsets();

  return (
    <View style={overlayStyles.backdrop}>
      <View style={[overlayStyles.topBar, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity
          onPress={onDone}
          style={overlayStyles.doneButton}
          accessibilityRole="button"
          accessibilityLabel="Done editing"
        >
          <AppText style={overlayStyles.doneText}>Done</AppText>
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        style={overlayStyles.keyboardArea}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={overlayStyles.inputWrapper}>
          <TextInput
            autoFocus
            value={value}
            onChangeText={onChange}
            style={overlayStyles.input}
            returnKeyType="done"
            onSubmitEditing={onDone}
            submitBehavior="blurAndSubmit"
            multiline={false}
            maxLength={60}
            selectionColor="#F5C842"
            placeholderTextColor="rgba(245, 200, 66, 0.35)"
            placeholder="Type something..."
          />
        </View>
      </KeyboardAvoidingView>
    </View>
  );
};

const overlayStyles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.82)',
    zIndex: 100,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  doneButton: {
    paddingHorizontal: 4,
    paddingVertical: 4,
  },
  doneText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: FONT_WEIGHTS.semibold,
  },
  keyboardArea: {
    flex: 1,
  },
  inputWrapper: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  input: {
    color: '#F5C842',
    fontSize: 24,
    fontWeight: '800',
    textAlign: 'center',
    width: '100%',
    padding: 0,
    fontFamily: FONTS.inter,
  },
});

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function deriveTopLabel(entry: Entry): string {
  const year = entry.timestamp ? new Date(entry.timestamp).getFullYear() : new Date().getFullYear();
  return entry.country ? `${entry.country}, ${year}.` : `${year}.`;
}

function deriveBottomLabel(entry: Entry): string {
  return entry.season
    ? `Endless memories from ${capitalize(entry.season)}.`
    : 'Endless memories.';
}

function samePhotoTransform(a: PostcardPhotoTransform, b: PostcardPhotoTransform): boolean {
  const e = 1e-3;
  return (
    Math.abs(a.scale - b.scale) < e &&
    Math.abs(a.translateX - b.translateX) < e &&
    Math.abs(a.translateY - b.translateY) < e
  );
}

function stateSnapshot(
  photos: (string | null)[],
  labels: string[],
  ratio: RatioKey,
  transforms: PostcardPhotoTransform[],
  tplData: Record<string, unknown>
): string {
  return JSON.stringify({ photos, labels, ratio, transforms, tplData });
}

/** Normalize template IDs: 'two-photo-stack' or 'T11' → 'T-11' */
function normalizeTemplateId(id: string): string {
  if (id === 'two-photo-stack' || id === 'T11') return 'T-11';
  return id;
}

function loadTemplateComponent(templateId: string): React.ComponentType<any> | null {
  const norm = normalizeTemplateId(templateId);
  try {
    switch (norm) {
      case 'T-01':
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        return require('../components/postcards/templates/T01QuadCollageTemplate').default;
      case 'T-02':
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        return require('../components/postcards/templates/T02CameraViewfinderTemplate').default;
      case 'T-03':
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        return require('../components/postcards/templates/T03StatementCardTemplate').default;
      case 'T-04':
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        return require('../components/postcards/templates/T04LayeredScrapbookTemplate').default;
      case 'T-05':
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        return require('../components/postcards/templates/T05iMessageTemplate').default;
      case 'T-06':
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        return require('../components/postcards/templates/T06VerticalTriptychTemplate').default;
      case 'T-07':
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        return require('../components/postcards/templates/T07NotesJournalTemplate').default;
      case 'T-08':
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        return require('../components/postcards/templates/T08NotesDataLogTemplate').default;
      case 'T-09':
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        return require('../components/postcards/templates/T09MosaicCollageTemplate').default;
      case 'T-10':
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        return require('../components/postcards/templates/T10MinimalPhotoTemplate').default;
      case 'T-11':
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        return require('../components/postcards/templates/TwoPhotoStackTemplate').default;
      case 'T-12':
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        return require('../components/postcards/templates/T12TriptychBadgeTemplate').default;
      default:
        // Fallback to T-11 for legacy IDs
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        return require('../components/postcards/templates/TwoPhotoStackTemplate').default;
    }
  } catch (e) {
    logger.error('PostcardEditor: failed to load template', { templateId: norm, error: e });
    return null;
  }
}

const PostcardEditorScreen: React.FC<Props> = ({ route }) => {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { width: screenWidth } = useWindowDimensions();
  const { postcards, createPostcard, updatePostcard } = useAppContext();

  const templateRef = useRef<View>(null);

  const rawTemplateId = route.params?.templateId ?? 'T-11';
  const templateId = normalizeTemplateId(rawTemplateId);
  const isT11 = templateId === 'T-11';

  const registryEntry = getTemplateById(templateId);
  const displayName = registryEntry?.displayName ?? 'Create Postcard';

  /** Loaded after mount so AppNavigator's initial require() of this file does not pull Reanimated. */
  const [TemplateComponent, setTemplateComponent] = useState<React.ComponentType<any> | null>(null);
  const [templateLoadError, setTemplateLoadError] = useState<string | null>(null);

  // --- Multi-slot state ---
  const [photos, setPhotos] = useState<(string | null)[]>([null, null, null, null]);
  const [labels, setLabels] = useState<string[]>(['', '', '', '']);
  const [transforms, setTransforms] = useState<PostcardPhotoTransform[]>(
    Array(4).fill(null).map(() => ({ ...DEFAULT_POSTCARD_PHOTO_TRANSFORM }))
  );
  const [resetKeys, setResetKeys] = useState<number[]>([0, 0, 0, 0]);
  const [slotEntries, setSlotEntries] = useState<(Entry | null)[]>([null, null, null, null]);
  const [templateData, setTemplateData] = useState<Record<string, unknown>>({});

  const [activeSlot, setActiveSlot] = useState<number | null>(null);
  const [activeRatio, setActiveRatio] = useState<RatioKey>('4:5');
  const [activeTextSlot, setActiveTextSlot] = useState<number | null>(null);
  const [editingText, setEditingText] = useState('');
  const [isDownloading, setIsDownloading] = useState(false);
  const [editingChromeSuppressed, setEditingChromeSuppressed] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [savedPostcardId, setSavedPostcardId] = useState<string | null>(
    route.params?.postcardId ?? null
  );
  const [savedSnapshot, setSavedSnapshot] = useState<string | null>(null);

  useEffect(() => {
    setTemplateLoadError(null);
    const C = loadTemplateComponent(templateId);
    if (C && isRenderableComponentType(C)) {
      setTemplateComponent(() => C);
    } else {
      const msg = 'Postcard template did not export a valid component.';
      logger.error('PostcardEditor:', msg, templateId);
      setTemplateLoadError(msg);
    }
  }, [templateId]);

  useEffect(() => {
    const { postcardId } = route.params ?? {};
    if (!postcardId) return;
    const existing = postcards.find((p) => p.id === postcardId);
    if (!existing) return;
    const p0 = existing.topPhotoPath ?? null;
    const p1 = existing.bottomPhotoPath ?? null;
    const p2 = existing.photo3Path ?? null;
    const p3 = existing.photo4Path ?? null;
    setPhotos([p0, p1, p2, p3]);
    setLabels([existing.topLabel, existing.bottomLabel, '', '']);
    const t0 = existing.topPhotoTransform ?? { ...DEFAULT_POSTCARD_PHOTO_TRANSFORM };
    const t1 = existing.bottomPhotoTransform ?? { ...DEFAULT_POSTCARD_PHOTO_TRANSFORM };
    const t2 = existing.photo3Transform ?? { ...DEFAULT_POSTCARD_PHOTO_TRANSFORM };
    const t3 = existing.photo4Transform ?? { ...DEFAULT_POSTCARD_PHOTO_TRANSFORM };
    setTransforms([t0, t1, t2, t3]);
    setActiveRatio(existing.aspectRatio);
    setSavedPostcardId(existing.id);
    if (existing.templateData) setTemplateData(existing.templateData);
    setSavedSnapshot(
      stateSnapshot(
        [p0, p1, p2, p3],
        [existing.topLabel, existing.bottomLabel, '', ''],
        existing.aspectRatio,
        [t0, t1, t2, t3],
        existing.templateData ?? {}
      )
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const templateWidth = screenWidth - SPACING.lg * 2;
  const aspectRatio = RATIO_OPTIONS.find((r) => r.label === activeRatio)!.value;

  const currentSnapshot = stateSnapshot(photos, labels, activeRatio, transforms, templateData);
  const isSaved = savedPostcardId !== null && savedSnapshot === currentSnapshot;
  const canDownload = photos[0] !== null && !isDownloading && !isSaving;

  const slots = useMemo<TemplateSlot[]>(
    () =>
      [0, 1, 2, 3].map((i) => ({
        photoUri: photos[i] ?? null,
        transform: transforms[i] ?? { ...DEFAULT_POSTCARD_PHOTO_TRANSFORM },
        resetKey: resetKeys[i] ?? 0,
        entry: slotEntries[i] ?? null,
      })),
    [photos, transforms, resetKeys, slotEntries]
  );

  const handleSlotPress = useCallback((slotIndex: number) => {
    setActiveSlot(slotIndex);
  }, []);

  const handleTransformChange = useCallback((slotIndex: number, next: PostcardPhotoTransform) => {
    setTransforms((prev) => {
      const n = [...prev];
      const cur = n[slotIndex] ?? { ...DEFAULT_POSTCARD_PHOTO_TRANSFORM };
      if (samePhotoTransform(cur, next)) return prev;
      n[slotIndex] = next;
      return n;
    });
  }, []);

  const handleResetSlotFraming = useCallback((slotIndex: number) => {
    setTransforms((prev) => {
      const n = [...prev];
      n[slotIndex] = { ...DEFAULT_POSTCARD_PHOTO_TRANSFORM };
      return n;
    });
    setResetKeys((prev) => {
      const n = [...prev];
      n[slotIndex] = (n[slotIndex] ?? 0) + 1;
      return n;
    });
  }, []);

  const handleLabelPress = useCallback(
    (slot: 'top' | 'bottom') => {
      const idx = slot === 'top' ? 0 : 1;
      setEditingText(labels[idx] ?? '');
      setActiveTextSlot(idx);
    },
    [labels]
  );

  const handleEditDone = useCallback(() => {
    if (activeTextSlot !== null) {
      setLabels((prev) => {
        const n = [...prev];
        n[activeTextSlot] = editingText;
        return n;
      });
    }
    setActiveTextSlot(null);
  }, [activeTextSlot, editingText]);

  const handlePhotoSelect = useCallback(
    (uri: string, entry: Entry) => {
      if (activeSlot === null) return;
      setPhotos((prev) => {
        const n = [...prev];
        n[activeSlot] = uri;
        return n;
      });
      setTransforms((prev) => {
        const n = [...prev];
        n[activeSlot] = { ...DEFAULT_POSTCARD_PHOTO_TRANSFORM };
        return n;
      });
      setSlotEntries((prev) => {
        const n = [...prev];
        n[activeSlot] = entry;
        return n;
      });
      if (activeSlot === 0) {
        setLabels((prev) => {
          const n = [...prev];
          n[0] = deriveTopLabel(entry);
          return n;
        });
      }
      if (activeSlot === 1) {
        setLabels((prev) => {
          const n = [...prev];
          n[1] = deriveBottomLabel(entry);
          return n;
        });
      }
      setActiveSlot(null);
    },
    [activeSlot]
  );

  const handleSave = async (downloaded = false): Promise<string> => {
    setIsSaving(true);
    try {
      const now = new Date().toISOString();
      const existingId = savedPostcardId;
      const id = existingId ?? generateUUID();

      const postcard: Postcard = {
        id,
        createdAt: existingId
          ? (postcards.find((p) => p.id === existingId)?.createdAt ?? now)
          : now,
        updatedAt: now,
        templateId: rawTemplateId,
        aspectRatio: activeRatio,
        topPhotoPath: photos[0] ?? null,
        bottomPhotoPath: photos[1] ?? null,
        photo3Path: photos[2] ?? null,
        photo4Path: photos[3] ?? null,
        topLabel: labels[0] ?? '',
        bottomLabel: labels[1] ?? '',
        downloaded,
        topPhotoTransform: transforms[0],
        bottomPhotoTransform: transforms[1],
        photo3Transform: transforms[2],
        photo4Transform: transforms[3],
        templateData: {
          ...templateData,
          slotEntryIds: slotEntries.map((e) => e?.id ?? null),
        },
      };

      if (existingId) {
        await updatePostcard(postcard);
      } else {
        await createPostcard(postcard);
        setSavedPostcardId(id);
      }

      const snap = stateSnapshot(
        photos,
        labels,
        activeRatio,
        transforms,
        {
          ...templateData,
          slotEntryIds: slotEntries.map((e) => e?.id ?? null),
        }
      );
      setSavedSnapshot(snap);
      return id;
    } finally {
      setIsSaving(false);
    }
  };

  const handleDownload = async () => {
    if (!templateRef.current || !canDownload) return;
    setIsDownloading(true);
    try {
      // Load only when user saves to camera roll (keeps them out of AppNavigator init path).
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const MediaLibrary = require('expo-media-library');
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { captureRef } = require('react-native-view-shot');

      const { status } = await MediaLibrary.requestPermissionsAsync(true);
      if (status !== 'granted') {
        Alert.alert(
          'Permission needed',
          'Allow JourneyOn to save to your photo library in Settings.'
        );
        return;
      }
      setEditingChromeSuppressed(true);
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      });
      const uri = await captureRef(templateRef, {
        format: 'jpg',
        quality: 0.95,
        result: 'tmpfile',
        width: 1080,
        height: Math.round(1080 / aspectRatio),
      });
      await MediaLibrary.saveToLibraryAsync(uri);
      await handleSave(true);
      Alert.alert('Saved', 'Your postcard has been saved to your camera roll.');
    } catch {
      Alert.alert('Error', 'Something went wrong. Please try again.');
    } finally {
      setEditingChromeSuppressed(false);
      setIsDownloading(false);
    }
  };

  const styles = useMemo(
    () =>
      StyleSheet.create({
        outer: {
          flex: 1,
          backgroundColor: colors.background,
        },
        header: {
          flexDirection: 'row',
          alignItems: 'center',
          paddingTop: insets.top + 8,
          paddingHorizontal: SPACING.lg,
          paddingBottom: 12,
        },
        backButton: {
          width: 40,
          height: 40,
          alignItems: 'center',
          justifyContent: 'center',
          marginRight: 4,
        },
        title: {
          fontFamily: FONTS.inter,
          fontSize: 20,
          fontWeight: FONT_WEIGHTS.bold,
          color: colors.textPrimary,
          flex: 1,
        },
        headerActions: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 4,
        },
        iconButton: {
          width: 40,
          height: 40,
          alignItems: 'center',
          justifyContent: 'center',
        },
        ratioRow: {
          flexDirection: 'row',
          justifyContent: 'center',
          alignItems: 'center',
          gap: 24,
          paddingBottom: 16,
        },
        ratioButton: {
          paddingHorizontal: 4,
          paddingVertical: 4,
        },
        ratioLabel: {
          fontFamily: FONTS.inter,
          fontSize: 13,
          color: colors.textSecondary,
        },
        ratioLabelActive: {
          fontWeight: FONT_WEIGHTS.bold,
          color: colors.textPrimary,
        },
        canvasArea: {
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: SPACING.lg,
          paddingBottom: insets.bottom + 16,
        },
        templateWrapper: {
          width: templateWidth,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 6 },
          shadowOpacity: 0.25,
          shadowRadius: 16,
          elevation: 10,
        },
        templateErrorText: {
          fontFamily: FONTS.inter,
          fontSize: 15,
          color: colors.textSecondary,
          textAlign: 'center',
          paddingHorizontal: 16,
        },
        badgePickerRow: {
          flexDirection: 'row',
          gap: 8,
          paddingHorizontal: SPACING.lg,
          paddingBottom: 10,
        },
        badgePill: {
          paddingHorizontal: 12,
          paddingVertical: 6,
          borderRadius: 20,
          backgroundColor: colors.surfaceVariant,
          borderWidth: 1,
          borderColor: colors.border,
        },
        badgePillActive: {
          backgroundColor: '#3A6B33',
          borderColor: '#3A6B33',
        },
        badgePillText: {
          fontFamily: FONTS.inter,
          fontSize: 12,
          color: colors.textSecondary,
          fontWeight: FONT_WEIGHTS.semibold,
        },
        badgePillTextActive: {
          color: '#fff',
        },
      }),
    [colors, insets, templateWidth]
  );

  // T-11 (Diptych) uses the old-style props
  const renderT11Template = () => {
    if (!TemplateComponent) return null;
    return (
      <TemplateComponent
        ref={templateRef}
        topPhoto={photos[0]}
        bottomPhoto={photos[1]}
        onSlotPress={(slot: 'top' | 'bottom') =>
          handleSlotPress(slot === 'top' ? 0 : 1)
        }
        onLabelPress={handleLabelPress}
        onResetSlotFraming={(slot: 'top' | 'bottom') =>
          handleResetSlotFraming(slot === 'top' ? 0 : 1)
        }
        topLabel={labels[0]}
        bottomLabel={labels[1]}
        topTransform={transforms[0]}
        bottomTransform={transforms[1]}
        onTopTransformChange={(t: PostcardPhotoTransform) => handleTransformChange(0, t)}
        onBottomTransformChange={(t: PostcardPhotoTransform) => handleTransformChange(1, t)}
        topResetKey={resetKeys[0]}
        bottomResetKey={resetKeys[1]}
        aspectRatio={aspectRatio}
        editingChromeSuppressed={editingChromeSuppressed}
      />
    );
  };

  const renderNewTemplate = () => {
    if (!TemplateComponent) return null;
    return (
      <TemplateComponent
        ref={templateRef}
        slots={slots}
        onSlotPress={handleSlotPress}
        onTransformChange={handleTransformChange}
        onResetSlotFraming={handleResetSlotFraming}
        templateData={templateData}
        onTemplateDataChange={setTemplateData}
        aspectRatio={aspectRatio}
        editingChromeSuppressed={editingChromeSuppressed}
      />
    );
  };

  return (
    <View style={styles.outer}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>

        <AppText style={styles.title}>{displayName}</AppText>

        <View style={styles.headerActions}>
          <TouchableOpacity
            style={styles.iconButton}
            onPress={() => handleSave(false)}
            disabled={isSaving || isSaved}
            accessibilityRole="button"
            accessibilityLabel={isSaved ? 'Postcard saved' : 'Save postcard'}
          >
            {isSaving ? (
              <ActivityIndicator size="small" color={colors.textPrimary} />
            ) : (
              <Ionicons
                name={isSaved ? 'bookmark' : 'bookmark-outline'}
                size={22}
                color={isSaved ? colors.textPrimary : colors.textSecondary}
              />
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.iconButton}
            onPress={handleDownload}
            disabled={!canDownload}
            accessibilityRole="button"
            accessibilityLabel="Save postcard to camera roll"
          >
            {isDownloading ? (
              <ActivityIndicator size="small" color={colors.textPrimary} />
            ) : (
              <Ionicons
                name="download-outline"
                size={22}
                color={canDownload ? colors.textPrimary : colors.textSecondary}
              />
            )}
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.ratioRow}>
        {RATIO_OPTIONS.map(({ label }) => {
          const isActive = label === activeRatio;
          return (
            <TouchableOpacity
              key={label}
              style={styles.ratioButton}
              onPress={() => setActiveRatio(label)}
              activeOpacity={0.6}
              accessibilityRole="button"
              accessibilityLabel={`${label} ratio${isActive ? ', selected' : ''}`}
            >
              <AppText style={[styles.ratioLabel, isActive && styles.ratioLabelActive]}>
                {label}
              </AppText>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* T-12 badge type picker */}
      {templateId === 'T-12' && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.badgePickerRow}
        >
          {BADGE_TYPE_OPTIONS.map((opt) => {
            const isActive = (templateData.badgeType ?? 'temperature') === opt;
            return (
              <TouchableOpacity
                key={opt}
                style={[styles.badgePill, isActive && styles.badgePillActive]}
                onPress={() => setTemplateData((prev) => ({ ...prev, badgeType: opt }))}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={`Badge type: ${opt}${isActive ? ', selected' : ''}`}
              >
                <AppText style={[styles.badgePillText, isActive && styles.badgePillTextActive]}>
                  {opt}
                </AppText>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}

      <View style={styles.canvasArea}>
        <View style={styles.templateWrapper}>
          {templateLoadError !== null ? (
            <View style={{ minHeight: templateWidth * 0.6, justifyContent: 'center' }}>
              <AppText style={styles.templateErrorText}>{templateLoadError}</AppText>
              <AppText style={[styles.templateErrorText, { marginTop: 12, fontSize: 13 }]}>
                Use the back button to return.
              </AppText>
            </View>
          ) : TemplateComponent === null ? (
            <View style={{ minHeight: templateWidth * 1.2, justifyContent: 'center' }}>
              <ActivityIndicator size="large" color={colors.textSecondary} />
            </View>
          ) : isT11 ? (
            renderT11Template()
          ) : (
            renderNewTemplate()
          )}
        </View>
      </View>

      <PhotoPickerSheet
        visible={activeSlot !== null}
        onClose={() => setActiveSlot(null)}
        onSelect={handlePhotoSelect}
      />

      {activeTextSlot !== null && (
        <TextEditOverlay
          value={editingText}
          onChange={setEditingText}
          onDone={handleEditDone}
        />
      )}
    </View>
  );
};

export default PostcardEditorScreen;
