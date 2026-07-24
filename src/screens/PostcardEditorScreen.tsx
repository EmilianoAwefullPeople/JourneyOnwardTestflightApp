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
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
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
import { Analytics } from '../services/AnalyticsService';
import {
  normalizeTemplateId,
  getMaxSlotsForTemplate,
  loadTemplateComponent,
  buildSlotsFromPostcard,
  packPostcardPhotoFields,
} from '../components/postcards/templates/templateLoader';
import {
  parseSelectedRange,
  buildRangeTemplateData,
  formatDateRangeLabel,
  clampEndToRange,
  parseDateOnlyIso,
  addDays,
  RANGE_MIN_DAYS,
  RANGE_MAX_DAYS,
} from '../components/postcards/templates/monthCalendarUtils';
import {
  TRIPTYCH_DATA_CATEGORIES,
  parseDataCategory,
  type TriptychDataCategory,
} from '../components/postcards/templates/triptychStampsUtils';
import {
  LOCATION_TAG_MODES,
  LOCATION_GRANULARITIES,
  resolveTagMode,
  parseLocationGranularity,
  type LocationTagMode,
  type LocationGranularity,
} from '../components/postcards/templates/locationTagUtils';
import { deriveDiptychLabels } from '../components/postcards/templates/diptychCaptionUtils';

import type { TemplateSlot } from '../components/postcards/templates/sharedTypes';

type Props = NativeStackScreenProps<RootStackParamList, 'PostcardEditor'>;

type RatioKey = '1:1' | '4:5' | '9:16';

const RATIO_OPTIONS: { label: RatioKey; value: number }[] = [
  { label: '1:1', value: 1 },
  { label: '4:5', value: 4 / 5 },
  { label: '9:16', value: 9 / 16 },
];

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
            selectionColor="#FFE600"
            placeholderTextColor="rgba(255, 230, 0, 0.4)"
            placeholder="type something..."
          />
        </View>
      </KeyboardAvoidingView>
    </View>
  );
};

interface DateRangeSheetProps {
  visible: boolean;
  start: Date;
  end: Date;
  onChangeStart: (date: Date) => void;
  onChangeEnd: (date: Date) => void;
  onDone: () => void;
  onCancel: () => void;
}

const DateRangeSheet: React.FC<DateRangeSheetProps> = ({
  visible,
  start,
  end,
  onChangeStart,
  onChangeEnd,
  onDone,
  onCancel,
}) => {
  const insets = useSafeAreaInsets();

  if (!visible) return null;

  const minEnd = addDays(start, RANGE_MIN_DAYS - 1);
  const maxEnd = addDays(start, RANGE_MAX_DAYS - 1);

  return (
    <View style={rangeSheetStyles.backdrop}>
      <View style={[rangeSheetStyles.topBar, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity
          onPress={onCancel}
          style={rangeSheetStyles.topBarButton}
          accessibilityRole="button"
          accessibilityLabel="Cancel"
        >
          <AppText style={rangeSheetStyles.cancelText}>Cancel</AppText>
        </TouchableOpacity>
        <AppText style={rangeSheetStyles.title}>Select dates</AppText>
        <TouchableOpacity
          onPress={onDone}
          style={rangeSheetStyles.topBarButton}
          accessibilityRole="button"
          accessibilityLabel="Done"
        >
          <AppText style={rangeSheetStyles.doneText}>Done</AppText>
        </TouchableOpacity>
      </View>

      <View style={rangeSheetStyles.body}>
        <AppText style={rangeSheetStyles.label}>Start date</AppText>
        <DateTimePicker
          value={start}
          mode="date"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={(_, date) => date && onChangeStart(date)}
          textColor="#fff"
        />

        <AppText style={[rangeSheetStyles.label, { marginTop: 24 }]}>End date</AppText>
        <DateTimePicker
          value={end}
          mode="date"
          minimumDate={minEnd}
          maximumDate={maxEnd}
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={(_, date) => date && onChangeEnd(date)}
          textColor="#fff"
        />

        <AppText style={rangeSheetStyles.hint}>
          Trips can be {RANGE_MIN_DAYS}–{RANGE_MAX_DAYS} days long.
        </AppText>
      </View>
    </View>
  );
};

const rangeSheetStyles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.92)',
    zIndex: 100,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  topBarButton: {
    paddingHorizontal: 4,
    paddingVertical: 4,
    minWidth: 60,
  },
  title: {
    color: '#fff',
    fontSize: 16,
    fontWeight: FONT_WEIGHTS.semibold,
  },
  cancelText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 16,
  },
  doneText: {
    color: '#F5C842',
    fontSize: 16,
    fontWeight: FONT_WEIGHTS.semibold,
    textAlign: 'right',
  },
  body: {
    flex: 1,
    alignItems: 'center',
    paddingTop: 24,
    paddingHorizontal: 32,
  },
  label: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 14,
    fontWeight: FONT_WEIGHTS.semibold,
    marginBottom: 4,
  },
  hint: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 13,
    marginTop: 24,
    textAlign: 'center',
  },
});

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
    color: '#FFE600',
    fontSize: 24,
    fontWeight: '500',
    fontStyle: 'italic',
    textAlign: 'center',
    width: '100%',
    padding: 0,
    fontFamily: Platform.OS === 'ios' ? 'Helvetica' : FONTS.inter,
  },
});

function stateSnapshot(
  photos: (string | null)[],
  labels: string[],
  ratio: RatioKey,
  transforms: PostcardPhotoTransform[],
  tplData: Record<string, unknown>
): string {
  return JSON.stringify({ photos, labels, ratio, transforms, tplData });
}

function samePhotoTransform(a: PostcardPhotoTransform, b: PostcardPhotoTransform): boolean {
  const e = 1e-3;
  return (
    Math.abs(a.scale - b.scale) < e &&
    Math.abs(a.translateX - b.translateX) < e &&
    Math.abs(a.translateY - b.translateY) < e
  );
}

const PostcardEditorScreen: React.FC<Props> = ({ route }) => {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { width: screenWidth } = useWindowDimensions();
  const { postcards, entries, createPostcard, updatePostcard } = useAppContext();

  const templateRef = useRef<View>(null);

  // `rawTemplateId` is state (not a plain const) because when opening an existing postcard for
  // editing (SavedPostcardsScreen only passes `postcardId`), the real template isn't known until
  // the load-existing-postcard effect below finds it and corrects this.
  const [rawTemplateId, setRawTemplateId] = useState<string>(route.params?.templateId ?? 'T-11');
  const templateId = normalizeTemplateId(rawTemplateId);
  const isT11 = templateId === 'T-11';
  const isMonthCalendar = templateId === 'T-07';
  const isTriptychStamps = templateId === 'T-06';
  const isLocationTag = templateId === 'T-04';

  const maxSlots = getMaxSlotsForTemplate(templateId);

  /** Loaded after mount so AppNavigator's initial require() of this file does not pull Reanimated. */
  const [TemplateComponent, setTemplateComponent] = useState<React.ComponentType<any> | null>(null);
  const [templateLoadError, setTemplateLoadError] = useState<string | null>(null);

  // --- Multi-slot state ---
  const [photos, setPhotos] = useState<(string | null)[]>(() => Array(maxSlots).fill(null));
  const [labels, setLabels] = useState<string[]>(['', '', '', '']);
  const [transforms, setTransforms] = useState<PostcardPhotoTransform[]>(() =>
    Array(maxSlots).fill(null).map(() => ({ ...DEFAULT_POSTCARD_PHOTO_TRANSFORM }))
  );
  const [resetKeys, setResetKeys] = useState<number[]>(() => Array(maxSlots).fill(0));
  const [slotEntries, setSlotEntries] = useState<(Entry | null)[]>(() => Array(maxSlots).fill(null));
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
    // Correct the template (SavedPostcardsScreen only passes `postcardId`, not `templateId`).
    setRawTemplateId(existing.templateId);
    const loadedSlots = buildSlotsFromPostcard(existing, existing.templateId, entries);
    const loadedPhotos = loadedSlots.map((s) => s.photoUri);
    const loadedTransforms = loadedSlots.map((s) => s.transform);
    setPhotos(loadedPhotos);
    setTransforms(loadedTransforms);
    setSlotEntries(loadedSlots.map((s) => s.entry));
    setLabels([existing.label1, existing.label2, '', '']);
    setActiveRatio(existing.aspectRatio);
    setSavedPostcardId(existing.id);
    if (existing.templateData) setTemplateData(existing.templateData);
    setSavedSnapshot(
      stateSnapshot(
        loadedPhotos,
        [existing.label1, existing.label2, '', ''],
        existing.aspectRatio,
        loadedTransforms,
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
      photos.map((_, i) => ({
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

  const handleChangeDataCategory = useCallback((category: TriptychDataCategory) => {
    setTemplateData((prev) => ({
      ...prev,
      dataCategory: category,
    }));
  }, []);

  const selectedDataCategory = useMemo(
    () => (isTriptychStamps ? parseDataCategory(templateData) : 'temperature'),
    [isTriptychStamps, templateData]
  );

  const handleChangeTagMode = useCallback((mode: LocationTagMode) => {
    setTemplateData((prev) => ({ ...prev, locationTagMode: mode }));
  }, []);

  const handleChangeTagGranularity = useCallback((granularity: LocationGranularity) => {
    setTemplateData((prev) => ({ ...prev, locationGranularity: granularity }));
  }, []);

  const selectedTagMode = useMemo(
    () => (isLocationTag ? resolveTagMode(slotEntries[0], templateData) : 'location'),
    [isLocationTag, slotEntries, templateData]
  );

  const selectedTagGranularity = useMemo(
    () => (isLocationTag ? parseLocationGranularity(templateData) : 'place'),
    [isLocationTag, templateData]
  );

  const rangeLabel = useMemo(() => {
    if (!isMonthCalendar) return '';
    return formatDateRangeLabel(parseSelectedRange(templateData));
  }, [isMonthCalendar, templateData]);

  const [rangeSheetVisible, setRangeSheetVisible] = useState(false);
  const [draftRangeStart, setDraftRangeStart] = useState<Date>(() => new Date());
  const [draftRangeEnd, setDraftRangeEnd] = useState<Date>(() => addDays(new Date(), RANGE_MIN_DAYS - 1));

  const handleOpenRangeSheet = useCallback(() => {
    const range = parseSelectedRange(templateData);
    const start = parseDateOnlyIso(range.start) ?? new Date();
    const end = parseDateOnlyIso(range.end) ?? addDays(start, RANGE_MIN_DAYS - 1);
    setDraftRangeStart(start);
    setDraftRangeEnd(end);
    setRangeSheetVisible(true);
  }, [templateData]);

  const handleDraftStartChange = useCallback((date: Date) => {
    setDraftRangeStart(date);
    setDraftRangeEnd((prevEnd) => clampEndToRange(date, prevEnd));
  }, []);

  const handleRangeDone = useCallback(() => {
    setTemplateData((prev) => buildRangeTemplateData(prev, draftRangeStart, draftRangeEnd));
    setRangeSheetVisible(false);
  }, [draftRangeStart, draftRangeEnd]);

  const handleRangeCancel = useCallback(() => setRangeSheetVisible(false), []);

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
      const slotIndex = activeSlot;
      const nextSlotEntries = [...slotEntries];
      nextSlotEntries[slotIndex] = entry;

      setPhotos((prev) => {
        const n = [...prev];
        n[slotIndex] = uri;
        return n;
      });
      setTransforms((prev) => {
        const n = [...prev];
        n[slotIndex] = { ...DEFAULT_POSTCARD_PHOTO_TRANSFORM };
        return n;
      });
      setSlotEntries(nextSlotEntries);

      // Diptych: location on each photo; repeated location → bottom uses season/weather.
      if (isT11 && (slotIndex === 0 || slotIndex === 1)) {
        const [label1, label2] = deriveDiptychLabels(nextSlotEntries[0], nextSlotEntries[1]);
        setLabels((prev) => {
          const n = [...prev];
          n[0] = label1;
          n[1] = label2;
          return n;
        });
      }

      setActiveSlot(null);
    },
    [activeSlot, isT11, slotEntries]
  );

  const handleSave = async (downloaded = false): Promise<string> => {
    setIsSaving(true);
    try {
      const now = new Date().toISOString();
      const existingId = savedPostcardId;
      const id = existingId ?? generateUUID();
      const packed = packPostcardPhotoFields(photos, transforms);
      const nextTemplateData = {
        ...templateData,
        slotEntryIds: slotEntries.map((e) => e?.id ?? null),
        extraSlots: packed.extraSlots,
      };

      const postcard: Postcard = {
        id,
        createdAt: existingId
          ? (postcards.find((p) => p.id === existingId)?.createdAt ?? now)
          : now,
        updatedAt: now,
        templateId: rawTemplateId,
        aspectRatio: activeRatio,
        photo1Path: packed.photo1Path,
        photo2Path: packed.photo2Path,
        photo3Path: packed.photo3Path,
        photo4Path: packed.photo4Path,
        label1: labels[0] ?? '',
        label2: labels[1] ?? '',
        downloaded,
        photo1Transform: packed.photo1Transform,
        photo2Transform: packed.photo2Transform,
        photo3Transform: packed.photo3Transform,
        photo4Transform: packed.photo4Transform,
        templateData: nextTemplateData,
      };

      if (existingId) {
        await updatePostcard(postcard);
      } else {
        await createPostcard(postcard);
        setSavedPostcardId(id);
      }

      const snap = stateSnapshot(photos, labels, activeRatio, transforms, nextTemplateData);
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
          'Allow Journey Onward to save to your photo library in Settings.'
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
      const tripId = slotEntries.find(e => e?.albumId)?.albumId ?? null;
      Analytics.onPostcardExported(tripId).catch(() => {});
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
        headerSpacer: {
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
          paddingBottom: isMonthCalendar || isTriptychStamps || isLocationTag ? 16 : insets.bottom + 16,
        },
        monthSwitcherRow: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          paddingVertical: 10,
          paddingBottom: insets.bottom + 16,
        },
        monthSwitcherLabel: {
          fontFamily: FONTS.inter,
          fontSize: 14,
          fontWeight: FONT_WEIGHTS.semibold,
          color: colors.textPrimary,
          minWidth: 120,
          textAlign: 'center',
        },
        dataCategoryRow: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 10,
          paddingBottom: insets.bottom + 16,
        },
        dataCategoryButton: {
          width: 44,
          height: 44,
          borderRadius: 22,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.surface,
        },
        dataCategoryButtonActive: {
          backgroundColor: colors.textPrimary,
        },
        tagOptionsRow: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 10,
          paddingBottom: 12,
        },
        tagOptionsRowLast: {
          paddingBottom: insets.bottom + 16,
        },
        tagOptionButton: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          paddingHorizontal: 14,
          paddingVertical: 9,
          borderRadius: 18,
          backgroundColor: colors.surface,
        },
        tagOptionButtonActive: {
          backgroundColor: colors.textPrimary,
        },
        tagOptionText: {
          fontFamily: FONTS.inter,
          fontSize: 13,
          fontWeight: FONT_WEIGHTS.semibold,
          color: colors.textPrimary,
        },
        tagOptionTextActive: {
          color: colors.background,
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
      }),
    [colors, insets, templateWidth, isMonthCalendar, isTriptychStamps, isLocationTag]
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
        allEntries={entries}
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

        <View style={styles.headerSpacer} />

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

      {isMonthCalendar && (
        <TouchableOpacity
          style={styles.monthSwitcherRow}
          onPress={handleOpenRangeSheet}
          accessibilityRole="button"
          accessibilityLabel={`Change date range, currently ${rangeLabel}`}
        >
          <Ionicons name="calendar-outline" size={18} color={colors.textPrimary} />
          <AppText style={styles.monthSwitcherLabel}>{rangeLabel}</AppText>
          <Ionicons name="chevron-down" size={16} color={colors.textSecondary} />
        </TouchableOpacity>
      )}

      {isTriptychStamps && (
        <View style={styles.dataCategoryRow}>
          {TRIPTYCH_DATA_CATEGORIES.map(({ key, label, icon }) => {
            const isActive = selectedDataCategory === key;
            return (
              <TouchableOpacity
                key={key}
                style={[styles.dataCategoryButton, isActive && styles.dataCategoryButtonActive]}
                onPress={() => handleChangeDataCategory(key)}
                accessibilityRole="button"
                accessibilityLabel={`Show ${label.toLowerCase()}`}
                accessibilityState={{ selected: isActive }}
              >
                <Ionicons
                  name={icon}
                  size={22}
                  color={isActive ? colors.background : colors.textPrimary}
                />
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {isLocationTag && (
        <View
          style={[
            styles.tagOptionsRow,
            selectedTagMode !== 'location' && styles.tagOptionsRowLast,
          ]}
        >
          {LOCATION_TAG_MODES.map(({ key, label, icon }) => {
            const isActive = selectedTagMode === key;
            return (
              <TouchableOpacity
                key={key}
                style={[styles.tagOptionButton, isActive && styles.tagOptionButtonActive]}
                onPress={() => handleChangeTagMode(key)}
                accessibilityRole="button"
                accessibilityLabel={`Show ${label.toLowerCase()} tag`}
                accessibilityState={{ selected: isActive }}
              >
                <Ionicons name={icon} size={16} color={isActive ? colors.background : colors.textPrimary} />
                <AppText style={[styles.tagOptionText, isActive && styles.tagOptionTextActive]}>
                  {label}
                </AppText>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {isLocationTag && selectedTagMode === 'location' && (
        <View style={[styles.tagOptionsRow, styles.tagOptionsRowLast]}>
          {LOCATION_GRANULARITIES.map(({ key, label }) => {
            const isActive = selectedTagGranularity === key;
            return (
              <TouchableOpacity
                key={key}
                style={[styles.tagOptionButton, isActive && styles.tagOptionButtonActive]}
                onPress={() => handleChangeTagGranularity(key)}
                accessibilityRole="button"
                accessibilityLabel={`Show ${label.toLowerCase()}`}
                accessibilityState={{ selected: isActive }}
              >
                <AppText style={[styles.tagOptionText, isActive && styles.tagOptionTextActive]}>
                  {label}
                </AppText>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

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

      <DateRangeSheet
        visible={rangeSheetVisible}
        start={draftRangeStart}
        end={draftRangeEnd}
        onChangeStart={handleDraftStartChange}
        onChangeEnd={setDraftRangeEnd}
        onDone={handleRangeDone}
        onCancel={handleRangeCancel}
      />
    </View>
  );
};

export default PostcardEditorScreen;
