// TripAlbumCreateScreen
// Multi-step wizard for creating a trip album: title, start date, end date, description

import React, { useEffect, useState, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  Keyboard,
  Alert,
  Platform,
  ScrollView,
  KeyboardAvoidingView,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { CommonActions } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import DateTimePicker from '@react-native-community/datetimepicker';
import { RootStackParamList } from '../navigation/types';
import { useAppContext } from '../context/AppContext';
import { COLORS, DIMENSIONS, FONTS, FONT_WEIGHTS, SPACING } from '../config/constants';
import { logger } from '../utils/logger';
import { useTheme } from '../context/ThemeContext';
import { MeshGradientBackground } from '../components/common/MeshGradientBackground';
import BackArrow from '../components/common/icons/BackArrow';
import { TripAlbum } from '../models/TripAlbum';
import { generateUUID } from '../utils/uuid';

type TripAlbumCreateNavigationProp = NativeStackNavigationProp<RootStackParamList>;
type TripAlbumScreenRouteProp = RouteProp<RootStackParamList, 'TripAlbumCreate' | 'TripAlbumEdit'>;

type Step = 1 | 2 | 3 | 4;

const TripAlbumCreateScreen: React.FC = () => {
  const navigation = useNavigation<TripAlbumCreateNavigationProp>();
  const route = useRoute<TripAlbumScreenRouteProp>();
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const { createTripAlbum, updateTripAlbum, tripAlbums, pendingOnboardingPath, completeOnboarding } = useAppContext();

  const albumId = (route.params as { albumId?: string } | undefined)?.albumId;
  const isEditMode = Boolean(albumId);
  const existingAlbum = useMemo(
    () => (albumId ? tripAlbums.find((a) => a.id === albumId) : null),
    [albumId, tripAlbums]
  );

  const [step, setStep] = useState<Step>(1);
  const [title, setTitle] = useState('');
  const [startDate, setStartDate] = useState(() => new Date());
  const [endDate, setEndDate] = useState(() => new Date());
  const [description, setDescription] = useState('');
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [saving, setSaving] = useState(false);

  const titleInputRef = useRef<TextInput>(null);
  const descriptionInputRef = useRef<TextInput>(null);

  // Prefill form when editing
  useEffect(() => {
    if (existingAlbum) {
      setTitle(existingAlbum.name);
      setStartDate(new Date(existingAlbum.startDate));
      setEndDate(existingAlbum.endDate ? new Date(existingAlbum.endDate) : new Date(existingAlbum.startDate));
      setDescription(existingAlbum.description ?? '');
    }
  }, [existingAlbum]);

  // Keep end date >= start date
  useEffect(() => {
    if (endDate < startDate) {
      setEndDate(new Date(startDate.getTime()));
    }
  }, [startDate]);

  // Keyboard listeners
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

    return () => {
      subShow.remove();
      subHide.remove();
    };
  }, []);

  const handleBack = () => {
    Keyboard.dismiss();
    if (step === 1) {
      navigation.goBack();
    } else {
      setStep((s) => (s - 1) as Step);
    }
  };

  const handleNext = () => {
    Keyboard.dismiss();
    if (step < 4) {
      setStep((s) => (s + 1) as Step);
    }
  };

  const handleDismissKeyboard = () => {
    Keyboard.dismiss();
  };

  const handleSave = async () => {
    Keyboard.dismiss();
    if (saving) return;

    const album: TripAlbum = {
      id: isEditMode && existingAlbum ? existingAlbum.id : generateUUID(),
      name: title.trim(),
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      description: description.trim() || undefined,
      ...(existingAlbum && {
        locationName: existingAlbum.locationName,
        locationLat: existingAlbum.locationLat,
        locationLng: existingAlbum.locationLng,
        plans: existingAlbum.plans,
        intentions: existingAlbum.intentions,
        travelReasons: existingAlbum.travelReasons,
        travelReasonText: existingAlbum.travelReasonText,
        notes: existingAlbum.notes,
        entryIds: existingAlbum.entryIds,
      }),
    };

    setSaving(true);
    try {
      if (isEditMode) {
        await updateTripAlbum(album);
        navigation.goBack();
      } else {
        await createTripAlbum(album, 'new');
        if (pendingOnboardingPath === 'trip_album') {
          await completeOnboarding('trip_album');
        }
        navigation.dispatch(
          CommonActions.reset({
            index: 0,
            routes: [
              {
                name: 'MainTabs',
                state: {
                  index: 1,
                  routes: [
                    { name: 'Home' },
                    { name: 'Review', params: { initialSection: 'tripAlbums' } },
                  ],
                },
              },
            ],
          })
        );
      }
    } catch (error) {
      logger.error(isEditMode ? 'Error updating trip album:' : 'Error creating trip album:', error);
      Alert.alert(
        'Error',
        isEditMode ? 'Failed to update trip album. Please try again.' : 'Failed to create trip album. Please try again.'
      );
    } finally {
      setSaving(false);
    }
  };

  const canProceedStep1 = title.trim().length > 0;
  const contentBottomPadding = isKeyboardOpen ? keyboardHeight + SPACING.lg : SPACING.xxl;

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: { flex: 1, backgroundColor: colors.background },
        header: { paddingHorizontal: SPACING.md, paddingBottom: SPACING.sm },
        backButton: { alignSelf: 'flex-start', paddingVertical: SPACING.sm, paddingRight: SPACING.md },
        backButtonText: { fontFamily: FONTS.inter, fontSize: 17, color: colors.textPrimary, fontWeight: FONT_WEIGHTS.semibold },
        scrollContent: { flexGrow: 1, paddingHorizontal: SPACING.lg, paddingTop: SPACING.lg },
        stepContent: { flex: 1 },
        label: {
          fontFamily: FONTS.playfairDisplay,
          fontSize: 22,
          fontStyle: 'italic',
          fontWeight: FONT_WEIGHTS.bold,
          color: colors.textPrimary,
          marginBottom: SPACING.lg,
        },
        titleInput: {
          fontFamily: FONTS.inter,
          fontSize: 18,
          color: colors.textPrimary,
          backgroundColor: 'transparent',
          paddingHorizontal: 0,
          paddingVertical: SPACING.lg,
          marginBottom: SPACING.xl,
        },
        pickerContainer: { marginBottom: SPACING.xl, alignItems: 'center' },
        descriptionTitle: {
          fontFamily: FONTS.playfairDisplay,
          fontSize: 22,
          fontStyle: 'italic',
          fontWeight: FONT_WEIGHTS.bold,
          color: colors.textPrimary,
          marginBottom: SPACING.lg,
        },
        descriptionInput: {
          fontFamily: FONTS.inter,
          fontSize: 16,
          color: colors.textPrimary,
          backgroundColor: 'transparent',
          paddingHorizontal: 0,
          paddingVertical: SPACING.lg,
          minHeight: 120,
          marginBottom: SPACING.xl,
        },
        primaryButton: {
          backgroundColor: colors.surface,
          borderRadius: DIMENSIONS.borderRadiusModal,
          paddingVertical: Math.round(SPACING.md * 0.85),
          paddingHorizontal: Math.round(SPACING.xl * 0.85),
          alignItems: 'center',
          alignSelf: 'flex-end',
        },
        primaryButtonText: {
          fontFamily: FONTS.inter,
          fontSize: 14,
          fontWeight: FONT_WEIGHTS.semibold,
          color: colors.textPrimary,
        },
      }),
    [colors]
  );

  // Step 1: Title
  const renderStep1 = () => (
    <TouchableWithoutFeedback onPress={handleDismissKeyboard}>
      <View style={styles.stepContent}>
        <Text style={styles.label}>Give your album a title</Text>
        <TextInput
          ref={titleInputRef}
          style={styles.titleInput}
          placeholder="Album title"
          placeholderTextColor={colors.textSecondary}
          value={title}
          onChangeText={setTitle}
          autoCapitalize="words"
          returnKeyType="next"
          maxLength={120}
        />
        {canProceedStep1 && (
          <TouchableOpacity style={styles.primaryButton} onPress={handleNext} activeOpacity={0.7}>
            <Text style={styles.primaryButtonText}>Next →</Text>
          </TouchableOpacity>
        )}
      </View>
    </TouchableWithoutFeedback>
  );

  // Step 2: Start date
  const renderStep2 = () => (
    <View style={styles.stepContent}>
      <Text style={styles.label}>Date of start of the trip</Text>
      <View style={styles.pickerContainer}>
        <DateTimePicker
          value={startDate}
          mode="date"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={(_, date) => date && setStartDate(date)}
          textColor={colors.textPrimary}
        />
      </View>
      <TouchableOpacity style={styles.primaryButton} onPress={handleNext} activeOpacity={0.7}>
        <Text style={styles.primaryButtonText}>Next →</Text>
      </TouchableOpacity>
    </View>
  );

  // Step 3: End date
  const renderStep3 = () => (
    <View style={styles.stepContent}>
      <Text style={styles.label}>Date of end of the trip</Text>
      <View style={styles.pickerContainer}>
        <DateTimePicker
          value={endDate}
          mode="date"
          minimumDate={startDate}
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={(_, date) => date && setEndDate(date)}
          textColor={colors.textPrimary}
        />
      </View>
      <TouchableOpacity style={styles.primaryButton} onPress={handleNext} activeOpacity={0.7}>
        <Text style={styles.primaryButtonText}>Next →</Text>
      </TouchableOpacity>
    </View>
  );

  // Step 4: Description
  const renderStep4 = () => (
    <TouchableWithoutFeedback onPress={handleDismissKeyboard}>
      <View style={[styles.stepContent, { paddingBottom: contentBottomPadding }]}>
        <Text style={styles.descriptionTitle}>Extra thoughts?</Text>
        <TextInput
          ref={descriptionInputRef}
          style={styles.descriptionInput}
          placeholder="Write a description..."
          placeholderTextColor={colors.textSecondary}
          value={description}
          onChangeText={setDescription}
          multiline
          textAlignVertical="top"
          maxLength={2000}
        />
        <TouchableOpacity
          style={styles.primaryButton}
          onPress={handleSave}
          activeOpacity={0.7}
          disabled={saving}
        >
          <Text style={styles.primaryButtonText}>
            {isEditMode ? 'Save' : description.trim().length > 0 ? 'Save' : 'Skip & Save'}
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
        <TouchableOpacity onPress={handleBack} style={styles.backButton} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={step === 1 ? 'Close' : 'Back'}>
          {step === 1 ? (
            <BackArrow width={19} height={21} color={colors.textPrimary} />
          ) : (
            <Text style={styles.backButtonText}>← Back</Text>
          )}
        </TouchableOpacity>
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

export default TripAlbumCreateScreen;
