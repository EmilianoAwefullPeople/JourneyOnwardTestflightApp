// NotesEditorScreen
// Full-screen dedicated editor for creating journal entries

import React, { useEffect, useState, useRef, useMemo } from 'react';
import {
  View,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  Keyboard,
  Animated,
  Dimensions,
  Easing,
  Alert,
} from 'react-native';
import AppText from '../components/common/AppText';
import AppTextInput from '../components/common/AppTextInput';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { RootStackParamList } from '../navigation/types';
import { useAppContext } from '../context/AppContext';
import { useProgress } from '../context/ProgressContext';
import { logger } from '../utils/logger';
import { COLORS, DIMENSIONS, FONT_WEIGHTS, FONTS } from '../config/constants';
import { useTheme } from '../context/ThemeContext';
import { ANIMATION_CONFIG } from '../utils/animations';
import { Journal } from '../models/Journal';
import { generateUUID } from '../utils/uuid';

type NotesEditorNavigationProp = NativeStackNavigationProp<RootStackParamList, 'NotesEditor'>;
type NotesEditorRouteProp = RouteProp<RootStackParamList, 'NotesEditor'>;

const NotesEditorScreen: React.FC = () => {
  const navigation = useNavigation<NotesEditorNavigationProp>();
  const route = useRoute<NotesEditorRouteProp>();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const entryId = route.params?.entryId;
  const albumIdFromParams = route.params?.albumId;
  const journalPlaceholderFromRoute = route.params?.journalPlaceholder?.trim();
  const { createJournal, updateEntry, entries, activeTripAlbum } = useAppContext();
  const { record } = useProgress();
  
  const [noteText, setNoteText] = useState<string>('');
  const [isKeyboardOpen, setIsKeyboardOpen] = useState<boolean>(false);
  const [keyboardHeight, setKeyboardHeight] = useState<number>(0);
  const notesInputRef = useRef<TextInput>(null);
  
  // Animation values
  const saveButtonOpacity = useRef(new Animated.Value(0)).current;
  const screenOpacity = useRef(new Animated.Value(0)).current;
  const contentTranslateY = useRef(new Animated.Value(20)).current;
  
  const screenHeight = Dimensions.get('window').height;
  
  // Entrance animation and keyboard listeners
  useEffect(() => {
    // Entrance animation - syncs with HomeScreen expand animation
    Animated.parallel([
      Animated.timing(screenOpacity, {
        toValue: 1,
        duration: 550,
        easing: Easing.bezier(0.25, 0.1, 0.25, 1),
        useNativeDriver: true,
      }),
      Animated.timing(contentTranslateY, {
        toValue: 0,
        duration: 550,
        easing: Easing.bezier(0.25, 0.1, 0.25, 1),
        useNativeDriver: true,
      }),
    ]).start();
    
    const keyboardWillShow = Keyboard.addListener('keyboardWillShow', (e) => {
      setKeyboardHeight(e.endCoordinates.height);
      setIsKeyboardOpen(true);
    });
    
    const keyboardWillHide = Keyboard.addListener('keyboardWillHide', () => {
      setKeyboardHeight(0);
      setIsKeyboardOpen(false);
    });

    // Auto-focus on mount
    const timer = setTimeout(() => {
      notesInputRef.current?.focus();
    }, 350);

    return () => {
      keyboardWillShow.remove();
      keyboardWillHide.remove();
      clearTimeout(timer);
    };
  }, [screenOpacity, contentTranslateY]);
  
  const performClose = () => {
    Keyboard.dismiss();

    Animated.parallel([
      Animated.timing(screenOpacity, {
        toValue: 0,
        duration: 400,
        easing: Easing.bezier(0.25, 0.1, 0.25, 1),
        useNativeDriver: true,
      }),
      Animated.timing(contentTranslateY, {
        toValue: 50,
        duration: 400,
        easing: Easing.bezier(0.25, 0.1, 0.25, 1),
        useNativeDriver: true,
      }),
    ]).start();

    setTimeout(() => {
      try {
        navigation.goBack();
      } catch (e) {
        logger.warn('NotesEditorScreen: goBack failed', e);
      }
    }, 200);
  };

  const handleClose = () => {
    const hasUnsavedChanges = noteText.trim().length > 0;
    if (hasUnsavedChanges) {
      Alert.alert(
        'Discard changes?',
        'Are you sure you want to go back?',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Yes',
            onPress: performClose,
          },
        ]
      );
    } else {
      performClose();
    }
  };
  
  const handleSave = async () => {
    if (noteText.trim().length === 0) return;
    
    Keyboard.dismiss();
    
    // Get current location
    let latitude: number | undefined;
    let longitude: number | undefined;
    
    try {
      const locationModule = await import('expo-location');
      const { status } = await locationModule.getForegroundPermissionsAsync();
      
      if (status === 'granted') {
        const location = await locationModule.getLastKnownPositionAsync({});
        if (location) {
          latitude = location.coords.latitude;
          longitude = location.coords.longitude;
        }
      }
    } catch (error) {
      logger.log('Could not get location for journal:', error);
    }
    
    // Create journal object (optionally linked to an experience for branching; albumId from params or active trip)
    const journal: Journal = {
      id: generateUUID(),
      content: noteText.trim(),
      timestamp: new Date().toISOString(),
      cycleType: 'end-day',
      latitude,
      longitude,
      albumId: albumIdFromParams ?? activeTripAlbum?.id,
      ...(entryId != null ? { linkedEntryId: entryId } : {}),
    };
    
    // Save and show the open-journal-entry-card (JournalDetail) as the next screen
    try {
      await createJournal(journal);
      if (entryId) {
        const linkedEntry = entries.find((e) => e.id === entryId);
        if (linkedEntry && linkedEntry.journalId !== journal.id) {
          await updateEntry({ ...linkedEntry, journalId: journal.id });
        }
      }
      try {
        record('first_journal');
      } catch (_) {
        // Non-blocking
      }
      try {
        navigation.replace('JournalDetail', { journalId: journal.id });
      } catch (navError) {
        logger.warn('NotesEditor: replace to JournalDetail failed, falling back to navigate', navError);
        navigation.navigate('JournalDetail', { journalId: journal.id });
      }
    } catch (error) {
      logger.error('Error saving journal:', error);
      Alert.alert('Error', 'Failed to save journal. Please try again.');
    }
  };
  
  const handleTextChange = (text: string) => {
    setNoteText(text);
    
    // Show/hide Save button based on text content
    const hasText = text.trim().length > 0;
    Animated.timing(saveButtonOpacity, {
      toValue: hasText ? 1 : 0,
      duration: 200,
      easing: ANIMATION_CONFIG.easing.easeOut,
      useNativeDriver: true,
    }).start();
  };
  
  const handleBlurOverlayPress = () => {
    notesInputRef.current?.blur();
  };

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: { flex: 1, backgroundColor: 'transparent' },
        notesContainer: {
          flex: 1,
          backgroundColor: colors.background,
          paddingTop: insets.top + 60,
          paddingBottom: insets.bottom + 20,
          paddingHorizontal: 16,
        },
        closeButtonWrapper: { position: 'absolute', top: insets.top + 20, right: 16, zIndex: 1003 },
        closeButton: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
        closeText: { fontSize: 45, color: colors.textPrimary, fontFamily: FONTS.inter, lineHeight: 45 },
        inputWrapper: { flex: 1, marginTop: 20, marginBottom: 110 },
        textInput: {
          flex: 1,
          color: colors.textPrimary,
          fontSize: 17,
          fontFamily: FONTS.inter,
          lineHeight: 24,
          paddingTop: 16,
          paddingBottom: 16,
          paddingLeft: 16,
        },
        saveButton: {
          backgroundColor: colors.surface,
          borderRadius: 20,
          paddingHorizontal: 16,
          paddingVertical: 8,
          minWidth: 60,
          alignItems: 'center',
        },
        saveButtonText: {
          color: colors.textPrimary,
          fontSize: 16,
          fontWeight: FONT_WEIGHTS.semibold,
          fontFamily: FONTS.inter,
        },
      }),
    [colors, insets.top, insets.bottom]
  );
  
  return (
    <Animated.View 
      style={[
        styles.container,
        {
          opacity: screenOpacity,
          transform: [{ translateY: contentTranslateY }],
        },
      ]}
    >
      {/* Full-screen touchable to dismiss keyboard */}
      <TouchableWithoutFeedback onPress={handleBlurOverlayPress}>
        <View style={styles.notesContainer}>
          {/* Close Button (X) - Stops propagation to parent */}
          <View style={styles.closeButtonWrapper}>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={handleClose}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Close"
            >
              <AppText style={styles.closeText}>×</AppText>
            </TouchableOpacity>
          </View>
          
          {/* Text Input Wrapper - Stops propagation to parent */}
          <TouchableWithoutFeedback>
            <View style={styles.inputWrapper}>
              <AppTextInput
                ref={notesInputRef}
                style={styles.textInput}
                placeholder={
                  entryId
                    ? 'Write About This Experience...'
                    : journalPlaceholderFromRoute && journalPlaceholderFromRoute.length > 0
                      ? journalPlaceholderFromRoute
                      : 'Type and document it here...'
                }
                placeholderTextColor={colors.textSecondary}
                value={noteText}
                onChangeText={handleTextChange}
                multiline
                autoFocus={false}
                returnKeyType="done"
                maxLength={2000}
                textAlignVertical="top"
              />
            </View>
          </TouchableWithoutFeedback>
          
          {/* Save Button - Stops propagation to parent */}
          <Animated.View 
            style={{ 
              opacity: saveButtonOpacity,
              position: 'absolute',
              right: 16,
              bottom: isKeyboardOpen ? keyboardHeight + 16 : insets.bottom + 80,
            }}
          >
            <TouchableOpacity
              style={styles.saveButton}
              onPress={handleSave}
              disabled={noteText.trim().length === 0}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Save journal"
              accessibilityState={{ disabled: noteText.trim().length === 0 }}
            >
              <AppText style={styles.saveButtonText}>Save</AppText>
            </TouchableOpacity>
          </Animated.View>
        </View>
      </TouchableWithoutFeedback>
    </Animated.View>
  );
};

export default NotesEditorScreen;
