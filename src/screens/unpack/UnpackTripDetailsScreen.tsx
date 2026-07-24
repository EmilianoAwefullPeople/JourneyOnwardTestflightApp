// UnpackTripDetailsScreen — Stage 1 of 4
// Collects trip name, start date, end date, optional caption.
// Does NOT persist the album — passes metadata forward so Stage 3 can create it
// only after the user commits to saving experiences.

import React, { useEffect, useState, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  Keyboard,
  Platform,
  ScrollView,
  KeyboardAvoidingView,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { RootStackParamList } from '../../navigation/types';
import { useTheme } from '../../context/ThemeContext';
import { FONTS, FONT_WEIGHTS, SPACING } from '../../config/constants';
import { MeshGradientBackground } from '../../components/common/MeshGradientBackground';
import { UnpackStepBar } from '../../components/unpack/UnpackStepBar';
import { generateUUID } from '../../utils/uuid';

type NavProp = NativeStackNavigationProp<RootStackParamList>;
type RoutePropT = RouteProp<RootStackParamList, 'UnpackTripDetails'>;
type InnerStep = 1 | 2 | 3 | 4;

const UnpackTripDetailsScreen: React.FC = () => {
  const navigation = useNavigation<NavProp>();
  const route = useRoute<RoutePropT>();
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();

  // Path B: arrived after photos were clustered; dates are inferred from EXIF.
  const inboundSuggestions = route.params?.suggestions;
  const isPhotosFirst = Array.isArray(inboundSuggestions);

  const [step, setStep] = useState<InnerStep>(1);
  const [title, setTitle] = useState('');
  const [startDate, setStartDate] = useState(() =>
    route.params?.inferredStartDate ? new Date(route.params.inferredStartDate) : new Date()
  );
  const [endDate, setEndDate] = useState(() =>
    route.params?.inferredEndDate ? new Date(route.params.inferredEndDate) : new Date()
  );
  const [description, setDescription] = useState('');
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  const titleInputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (endDate < startDate) setEndDate(new Date(startDate.getTime()));
  }, [startDate]);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const subShow = Keyboard.addListener(showEvent, (e) => {
      setKeyboardHeight(e.endCoordinates?.height ?? 0);
      setIsKeyboardOpen(true);
    });
    const subHide = Keyboard.addListener(hideEvent, () => {
      setKeyboardHeight(0);
      setIsKeyboardOpen(false);
    });
    return () => { subShow.remove(); subHide.remove(); };
  }, []);

  const handleBack = () => {
    Keyboard.dismiss();
    if (step === 1) navigation.goBack();
    else setStep((s) => (s - 1) as InnerStep);
  };

  const handleNext = () => {
    Keyboard.dismiss();
    setStep((s) => (s + 1) as InnerStep);
  };

  const handleSave = () => {
    Keyboard.dismiss();
    // Album is NOT persisted here. The albumId + metadata travel as nav params
    // through the flow. UnpackHighlightScreen creates the album in the DB only
    // after the user commits to saving experiences (Stage 3).
    const albumId = generateUUID();
    const name = title.trim();
    const startIso = startDate.toISOString();
    const endIso = endDate.toISOString();
    const desc = description.trim() || undefined;

    if (isPhotosFirst) {
      // Path B: photos already clustered — go straight to highlight
      navigation.navigate('UnpackHighlight', {
        albumId,
        suggestions: inboundSuggestions ?? [],
        albumName: name,
        albumStartDate: startIso,
        albumEndDate: endIso,
        albumDescription: desc,
      });
    } else {
      // Path A: default — proceed to photo selection
      navigation.navigate('UnpackAddMemories', {
        albumId,
        tripStartDate: startIso,
        tripEndDate: endIso,
        albumName: name,
        albumDescription: desc,
      });
    }
  };

  const canProceedStep1 = title.trim().length > 0;
  const contentBottomPadding = isKeyboardOpen ? keyboardHeight + SPACING.lg : SPACING.xxl;

  const styles = useMemo(() => StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: {
      paddingHorizontal: SPACING.lg,
      paddingBottom: SPACING.md,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: SPACING.md,
    },
    backButton: {
      paddingVertical: SPACING.sm,
      paddingRight: SPACING.md,
    },
    backText: {
      fontFamily: FONTS.inter,
      fontSize: 17,
      color: colors.textPrimary,
      fontWeight: FONT_WEIGHTS.semibold as any,
    },
    scrollContent: {
      flexGrow: 1,
      paddingHorizontal: SPACING.lg,
      paddingTop: SPACING.lg,
    },
    question: {
      fontFamily: FONTS.playfairDisplay,
      fontSize: 22,
      fontStyle: 'italic',
      fontWeight: FONT_WEIGHTS.bold as any,
      color: colors.textPrimary,
      marginBottom: SPACING.lg,
    },
    input: {
      fontFamily: FONTS.inter,
      fontSize: 18,
      color: colors.textPrimary,
      paddingHorizontal: 0,
      paddingVertical: SPACING.lg,
      marginBottom: SPACING.xl,
    },
    descriptionInput: {
      fontFamily: FONTS.inter,
      fontSize: 16,
      color: colors.textPrimary,
      paddingHorizontal: 0,
      paddingVertical: SPACING.lg,
      minHeight: 120,
      textAlignVertical: 'top',
      marginBottom: SPACING.xl,
    },
    pickerContainer: { marginBottom: SPACING.xl, alignItems: 'center' },
    cta: {
      borderRadius: 14,
      paddingVertical: SPACING.md,
      alignItems: 'center' as const,
      backgroundColor: colors.buttonGray,
    },
    ctaText: {
      fontFamily: FONTS.inter,
      fontSize: 15,
      fontWeight: FONT_WEIGHTS.semibold as any,
      color: colors.textPrimary,
    },
    stepContent: { flex: 1 },
    contextLine: {
      fontFamily: FONTS.inter,
      fontSize: 14,
      marginBottom: SPACING.md,
    },
    altPathWrap: {
      marginTop: SPACING.xl,
      alignItems: 'center',
      gap: SPACING.md,
    },
    altPathDivider: {
      height: StyleSheet.hairlineWidth,
      alignSelf: 'stretch',
    },
    altPathBtn: {
      paddingVertical: SPACING.xs,
    },
    altPathText: {
      fontFamily: FONTS.inter,
      fontSize: 14,
      textDecorationLine: 'underline',
    },
  }), [colors]);

  const renderStep1 = () => (
    <TouchableWithoutFeedback onPress={() => Keyboard.dismiss()}>
      <View style={styles.stepContent}>
        <Text style={styles.question}>Give your trip a name</Text>

        {isPhotosFirst && (inboundSuggestions?.length ?? 0) > 0 && (
          <Text style={[styles.contextLine, { color: colors.textSecondary }]}>
            {inboundSuggestions!.length} moment{inboundSuggestions!.length !== 1 ? 's' : ''} found and ready to highlight.
          </Text>
        )}

        <TextInput
          ref={titleInputRef}
          style={styles.input}
          placeholder="e.g. Tokyo in April"
          placeholderTextColor={colors.textSecondary}
          value={title}
          onChangeText={setTitle}
          autoCapitalize="words"
          returnKeyType="next"
          maxLength={120}
        />
        {canProceedStep1 && (
          <TouchableOpacity style={styles.cta} onPress={handleNext} activeOpacity={0.7}>
            <Text style={styles.ctaText}>Next →</Text>
          </TouchableOpacity>
        )}

        {!isPhotosFirst && (
          <View style={styles.altPathWrap}>
            <View style={[styles.altPathDivider, { backgroundColor: colors.border }]} />
            <TouchableOpacity
              style={styles.altPathBtn}
              onPress={() => navigation.navigate('UnpackAddMemories', {})}
              activeOpacity={0.6}
            >
              <Text style={[styles.altPathText, { color: colors.textSecondary }]}>
                Or start by importing photos
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </TouchableWithoutFeedback>
  );

  const renderStep2 = () => (
    <View style={styles.stepContent}>
      <Text style={styles.question}>When did it start?</Text>
      <View style={styles.pickerContainer}>
        <DateTimePicker
          value={startDate}
          mode="date"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={(_, date) => date && setStartDate(date)}
          textColor={colors.textPrimary}
          maximumDate={new Date()}
        />
      </View>
      <TouchableOpacity style={styles.cta} onPress={handleNext} activeOpacity={0.7}>
        <Text style={styles.ctaText}>Next →</Text>
      </TouchableOpacity>
    </View>
  );

  const renderStep3 = () => (
    <View style={styles.stepContent}>
      <Text style={styles.question}>When did it end?</Text>
      <View style={styles.pickerContainer}>
        <DateTimePicker
          value={endDate}
          mode="date"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          minimumDate={startDate}
          maximumDate={new Date()}
          onChange={(_, date) => date && setEndDate(date)}
          textColor={colors.textPrimary}
        />
      </View>
      <TouchableOpacity style={styles.cta} onPress={handleNext} activeOpacity={0.7}>
        <Text style={styles.ctaText}>Next →</Text>
      </TouchableOpacity>
    </View>
  );

  const renderStep4 = () => (
    <TouchableWithoutFeedback onPress={() => Keyboard.dismiss()}>
      <View style={[styles.stepContent, { paddingBottom: contentBottomPadding }]}>
        <Text style={styles.question}>Anything to say about it?</Text>
        <TextInput
          style={styles.descriptionInput}
          placeholder="A note, a feeling, what drew you there…"
          placeholderTextColor={colors.textSecondary}
          value={description}
          onChangeText={setDescription}
          multiline
          maxLength={2000}
        />
        <TouchableOpacity
          style={styles.cta}
          onPress={handleSave}
          activeOpacity={0.7}
        >
          <Text style={styles.ctaText}>
            {description.trim().length > 0 ? 'Start unpacking →' : 'Skip & continue →'}
          </Text>
        </TouchableOpacity>
      </View>
    </TouchableWithoutFeedback>
  );

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <MeshGradientBackground baseColor={colors.background} lightMode={!isDark} />

      <View style={[styles.header, { paddingTop: insets.top + SPACING.sm }]}>
        <View style={styles.headerRow}>
          <TouchableOpacity
            onPress={handleBack}
            style={styles.backButton}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={step === 1 ? 'Close' : 'Back'}
          >
            {step === 1 ? (
              <Ionicons name="close" size={22} color={colors.textPrimary} />
            ) : (
              <Text style={styles.backText}>← Back</Text>
            )}
          </TouchableOpacity>
        </View>
        <UnpackStepBar currentStage={isPhotosFirst ? 2 : 1} />
      </View>

      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.scrollContent, { paddingBottom: contentBottomPadding }]}
        showsVerticalScrollIndicator={false}
      >
        {step === 1 && renderStep1()}
        {step === 2 && renderStep2()}
        {step === 3 && renderStep3()}
        {step === 4 && renderStep4()}
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

export default UnpackTripDetailsScreen;
