// EmotionalCaptureFlow
// Two-step emotion capture (Figma 708-1261, 708-1313): Step 1 = 3x3 grid + Next; Step 2 = optional note + Skip & Save

import React, { useState, useRef, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  LayoutAnimation,
  Animated,
  Dimensions,
} from 'react-native';
import { SPACING, DIMENSIONS, FONTS, FONT_WEIGHTS, COLORS } from '../../config/constants';
import { TEXT_STYLES } from '../../config/typography';
import { useTheme } from '../../context/ThemeContext';
import { EMOTION_CAPTURE_OPTIONS } from '../../utils/emotionUtils';
import { ANIMATION_CONFIG } from '../../utils/animations';
import BackArrow from '../common/icons/BackArrow';

const EMOTION_NOTE_MAX_LENGTH = 200;
const STEP_TRANSITION_MS = 220;

export interface EmotionalCaptureFlowProps {
  onClose: () => void;
  onSave: (emotionLabels: string[], emotionNote?: string) => void;
  initialLabels?: string[];
  initialEmotionNote?: string;
  /** Optional safe area bottom inset so scroll content stays above home indicator when used in overlays. */
  bottomInset?: number;
}

const EmotionalCaptureFlow: React.FC<EmotionalCaptureFlowProps> = ({
  onClose,
  onSave,
  initialLabels = [],
  initialEmotionNote = '',
  bottomInset,
}) => {
  const { colors } = useTheme();
  const [step, setStep] = useState<1 | 2>(1);
  const [selectedLabels, setSelectedLabels] = useState<string[]>(initialLabels);
  const [emotionNote, setEmotionNote] = useState<string>(initialEmotionNote);
  const stepOpacity = useRef(new Animated.Value(1)).current;
  const gridStagger = useRef(EMOTION_CAPTURE_OPTIONS.map(() => new Animated.Value(0))).current;
  const selectionProgress = useRef(
    EMOTION_CAPTURE_OPTIONS.map(
      (_, i) => new Animated.Value(initialLabels.includes(EMOTION_CAPTURE_OPTIONS[i].label) ? 1 : 0)
    )
  ).current;

  const { width: winWidth } = Dimensions.get('window');
  const scaleFactor = Math.min(winWidth / 390, 1.2);
  const cellSize = Math.floor((winWidth - SPACING.md * 2 - SPACING.md * 2) / 3);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: { flex: 1, paddingHorizontal: SPACING.md },
        scroll: { flex: 1 },
        scrollContent: {
          flexGrow: 1,
          justifyContent: 'center',
          paddingVertical: SPACING.xl,
          paddingBottom: Math.max(SPACING.xl * 2, (bottomInset ?? 0) + SPACING.lg),
        },
        scrollContentStep2: {
          paddingBottom: Math.max(SPACING.xl, (bottomInset ?? 0) + SPACING.lg),
        },
        title: {
          ...TEXT_STYLES.entryInput,
          fontSize: 18,
          fontWeight: FONT_WEIGHTS.bold,
          color: colors.textPrimary,
          textAlign: 'center',
          marginTop: SPACING.sm,
          marginBottom: SPACING.xl,
        },
        gridRow: {
          flexDirection: 'row',
          justifyContent: 'space-between',
          marginBottom: SPACING.xl,
        },
        gridCell: {
          width: cellSize,
          alignItems: 'center',
          justifyContent: 'flex-start',
        },
        gridCellTouchable: {
          alignItems: 'center',
          justifyContent: 'flex-start',
          width: '100%',
          paddingVertical: SPACING.sm,
        },
        gridEmoji: { fontSize: 32 * scaleFactor, marginBottom: SPACING.xs },
        gridLabel: {
          ...TEXT_STYLES.entryInput,
          fontSize: 14,
          color: colors.textSecondary,
          textAlign: 'center',
        },
        gridLabelSelected: {
          color: colors.textPrimary,
          fontWeight: FONT_WEIGHTS.bold,
        },
        nextButton: {
          alignSelf: 'center',
          backgroundColor: COLORS.white,
          paddingHorizontal: SPACING.xl * 1.5,
          paddingVertical: SPACING.md,
          borderRadius: 24,
          marginTop: SPACING.xl,
        },
        nextButtonDisabled: {
          opacity: 0.5,
        },
        nextButtonText: {
          fontFamily: FONTS.inter,
          fontSize: 16,
          fontWeight: FONT_WEIGHTS.bold,
          color: COLORS.black,
        },
        step2Header: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: SPACING.lg,
          paddingHorizontal: 4,
        },
        backButton: { padding: 8 },
        backPlaceholder: { width: 40 },
        step2Summary: {
          fontFamily: FONTS.inter,
          fontSize: 14,
          color: colors.textSecondary,
          fontStyle: 'italic',
          marginBottom: SPACING.md,
          paddingLeft: SPACING.md,
        },
        noteInput: {
          ...TEXT_STYLES.entryInput,
          fontSize: 17,
          color: colors.textPrimary,
          backgroundColor: colors.surface,
          borderRadius: DIMENSIONS.borderRadiusModal,
          borderWidth: 0,
          borderColor: 'transparent',
          paddingHorizontal: SPACING.md,
          paddingVertical: SPACING.md,
          minHeight: 80,
          textAlignVertical: 'top',
        },
        skipSaveButton: {
          alignSelf: 'flex-end',
          backgroundColor: COLORS.white,
          paddingHorizontal: SPACING.xl * 1.5,
          paddingVertical: SPACING.md,
          borderRadius: 24,
          marginTop: SPACING.xl,
        },
        skipSaveButtonText: {
          fontFamily: FONTS.inter,
          fontSize: 16,
          fontWeight: FONT_WEIGHTS.semibold,
          color: COLORS.black,
        },
      }),
    [colors, cellSize, scaleFactor, bottomInset]
  );

  useEffect(() => {
    if (step === 1) {
      EMOTION_CAPTURE_OPTIONS.forEach((_, i) => {
        Animated.timing(gridStagger[i], {
          toValue: 1,
          duration: ANIMATION_CONFIG.durations.normal,
          delay: i * 30,
          useNativeDriver: true,
        }).start();
      });
    }
  }, [step]);

  useEffect(() => {
    EMOTION_CAPTURE_OPTIONS.forEach((_, i) => {
      const selected = selectedLabels.includes(EMOTION_CAPTURE_OPTIONS[i].label);
      Animated.timing(selectionProgress[i], {
        toValue: selected ? 1 : 0,
        duration: 150,
        useNativeDriver: false,
      }).start();
    });
  }, [selectedLabels]);

  const goToStep2 = () => {
    Animated.timing(stepOpacity, {
      toValue: 0,
      duration: STEP_TRANSITION_MS,
      useNativeDriver: true,
    }).start(() => {
      setStep(2);
      stepOpacity.setValue(0);
      Animated.timing(stepOpacity, {
        toValue: 1,
        duration: STEP_TRANSITION_MS,
        useNativeDriver: true,
      }).start();
    });
  };

  const goToStep1 = () => {
    Animated.timing(stepOpacity, {
      toValue: 0,
      duration: STEP_TRANSITION_MS,
      useNativeDriver: true,
    }).start(() => {
      setStep(1);
      stepOpacity.setValue(0);
      Animated.timing(stepOpacity, {
        toValue: 1,
        duration: STEP_TRANSITION_MS,
        useNativeDriver: true,
      }).start();
    });
  };

  const handleToggle = (label: string) => {
    if (Platform.OS === 'ios' || Platform.OS === 'android') {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    }
    if (selectedLabels.includes(label)) {
      setSelectedLabels((prev) => prev.filter((l) => l !== label));
    } else {
      setSelectedLabels((prev) => [...prev, label]);
    }
  };

  const handleSave = () => {
    const trimmed = selectedLabels.map((l) => l.trim()).filter(Boolean);
    const deduped = Array.from(new Set(trimmed));
    const note = emotionNote.trim().slice(0, EMOTION_NOTE_MAX_LENGTH).trim() || undefined;
    try {
      onSave(deduped, note);
    } catch (err) {
      // Caller may show error; keep overlay open
    }
  };

  const selectedSummary =
    selectedLabels.length > 0
      ? `You selected: ${selectedLabels.join(', ')}`
      : 'No emotions selected';

  if (step === 1) {
    return (
      <Animated.View style={[styles.container, { opacity: stepOpacity }]}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.title}>
            How would you{'\n'}describe your mood?
          </Text>

          <View style={styles.gridRow}>
            {[0, 1, 2].map((col) => {
              const item = EMOTION_CAPTURE_OPTIONS[col];
              if (!item) return <View key={col} style={styles.gridCell} />;
              const isSelected = selectedLabels.includes(item.label);
              return (
                <Animated.View key={item.label} style={[styles.gridCell, { opacity: gridStagger[col] }]}>
                  <TouchableOpacity
                    style={styles.gridCellTouchable}
                    onPress={() => handleToggle(item.label)}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityLabel={item.label}
                    accessibilityState={{ selected: isSelected }}
                    accessibilityHint={isSelected ? 'Double tap to deselect' : 'Double tap to select'}
                  >
                    <Text style={styles.gridEmoji}>{item.emoji}</Text>
                    <Animated.Text
                      style={[
                        styles.gridLabel,
                        isSelected && styles.gridLabelSelected,
                        {
                          color: selectionProgress[col].interpolate({
                            inputRange: [0, 1],
                            outputRange: [colors.textSecondary, colors.textPrimary],
                          }),
                        },
                      ]}
                      numberOfLines={1}
                    >
                      {item.label}
                    </Animated.Text>
                  </TouchableOpacity>
                </Animated.View>
              );
            })}
          </View>
          <View style={styles.gridRow}>
            {[3, 4, 5].map((col) => {
              const item = EMOTION_CAPTURE_OPTIONS[col];
              if (!item) return <View key={col} style={styles.gridCell} />;
              const isSelected = selectedLabels.includes(item.label);
              return (
                <Animated.View key={item.label} style={[styles.gridCell, { opacity: gridStagger[col] }]}>
                  <TouchableOpacity
                    style={styles.gridCellTouchable}
                    onPress={() => handleToggle(item.label)}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityLabel={item.label}
                    accessibilityState={{ selected: isSelected }}
                  >
                    <Text style={styles.gridEmoji}>{item.emoji}</Text>
                    <Animated.Text
                      style={[
                        styles.gridLabel,
                        isSelected && styles.gridLabelSelected,
                        {
                          color: selectionProgress[col].interpolate({
                            inputRange: [0, 1],
                            outputRange: [colors.textSecondary, colors.textPrimary],
                          }),
                        },
                      ]}
                      numberOfLines={1}
                    >
                      {item.label}
                    </Animated.Text>
                  </TouchableOpacity>
                </Animated.View>
              );
            })}
          </View>
          <View style={styles.gridRow}>
            {[6, 7, 8].map((col) => {
              const item = EMOTION_CAPTURE_OPTIONS[col];
              if (!item) return <View key={col} style={styles.gridCell} />;
              const isSelected = selectedLabels.includes(item.label);
              return (
                <Animated.View key={item.label} style={[styles.gridCell, { opacity: gridStagger[col] }]}>
                  <TouchableOpacity
                    style={styles.gridCellTouchable}
                    onPress={() => handleToggle(item.label)}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityLabel={item.label}
                    accessibilityState={{ selected: isSelected }}
                  >
                    <Text style={styles.gridEmoji}>{item.emoji}</Text>
                    <Animated.Text
                      style={[
                        styles.gridLabel,
                        isSelected && styles.gridLabelSelected,
                        {
                          color: selectionProgress[col].interpolate({
                            inputRange: [0, 1],
                            outputRange: [colors.textSecondary, colors.textPrimary],
                          }),
                        },
                      ]}
                      numberOfLines={1}
                    >
                      {item.label}
                    </Animated.Text>
                  </TouchableOpacity>
                </Animated.View>
              );
            })}
          </View>

          <TouchableOpacity
            style={[styles.nextButton, selectedLabels.length === 0 && styles.nextButtonDisabled]}
            onPress={goToStep2}
            activeOpacity={0.8}
            disabled={selectedLabels.length === 0}
            accessibilityRole="button"
            accessibilityLabel="Next"
            accessibilityState={{ disabled: selectedLabels.length === 0 }}
          >
            <Text style={styles.nextButtonText}>Next</Text>
          </TouchableOpacity>
        </ScrollView>
      </Animated.View>
    );
  }

  return (
    <Animated.View style={[styles.container, { flex: 1, opacity: stepOpacity }]}>
      <View style={styles.step2Header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={goToStep1}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Back to emotions"
        >
          <BackArrow width={20} height={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <View style={styles.backPlaceholder} />
      </View>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 60 : 0}
      >
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContentStep2}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.step2Summary}>{selectedSummary}</Text>
          <TextInput
            style={styles.noteInput}
            placeholder="Describe the feeling in a few words"
            placeholderTextColor={colors.textPrimary}
            value={emotionNote}
            onChangeText={(t) => setEmotionNote(t.slice(0, EMOTION_NOTE_MAX_LENGTH))}
            multiline
            maxLength={EMOTION_NOTE_MAX_LENGTH}
            textAlignVertical="top"
          />
          <TouchableOpacity
            style={styles.skipSaveButton}
            onPress={handleSave}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel={emotionNote.trim() ? 'Save' : 'Skip and save'}
          >
            <Text style={styles.skipSaveButtonText}>
              {emotionNote.trim() ? 'Save' : 'Skip & Save'}
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </Animated.View>
  );
};

export default EmotionalCaptureFlow;
