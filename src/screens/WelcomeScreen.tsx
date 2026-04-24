// WelcomeScreen
// Name collection screen per PRD Flow 1
// Auto-navigates after 3 seconds or on tap

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform, Pressable } from 'react-native';
import AppText from '../components/common/AppText';
import AppTextInput from '../components/common/AppTextInput';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppContext } from '../context/AppContext';
import { COLORS } from '../config/constants';
import { logger } from '../utils/logger';
import { useTheme } from '../context/ThemeContext';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';

type WelcomeScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, 'Welcome'>;

const WelcomeScreen: React.FC = () => {
  const [name, setName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { setUserName } = useAppContext();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<WelcomeScreenNavigationProp>();
  const hasNavigated = useRef(false);

  const handleNavigate = useCallback(async () => {
    if (hasNavigated.current) return;
    hasNavigated.current = true;

    try {
      if (name.trim() && !isSubmitting) {
        setIsSubmitting(true);
        try {
          await setUserName(name.trim());
        } catch (error) {
          logger.error('Error saving name:', error);
        } finally {
          setIsSubmitting(false);
        }
      }

      try {
        navigation.replace('MainTabs');
      } catch {
        navigation.navigate('MainTabs');
      }
    } catch (error) {
      logger.error('Navigation error:', error);
      hasNavigated.current = false;
    }
  }, [name, isSubmitting, setUserName, navigation]);

  useEffect(() => {
    const timer = setTimeout(handleNavigate, 3000);
    return () => clearTimeout(timer);
  }, [handleNavigate]);

  const handleContinue = async () => {
    if (hasNavigated.current) return;
    
    if (!name.trim()) {
      // If no name, just navigate
      handleNavigate();
      return;
    }

    setIsSubmitting(true);
    try {
      await setUserName(name.trim());
      handleNavigate();
    } catch (error) {
      logger.error('Error saving name:', error);
      setIsSubmitting(false);
    }
  };

  const handlePress = () => {
    if (!hasNavigated.current) handleNavigate();
  };

  return (
    <Pressable
      style={[
        styles.container,
        {
          backgroundColor: colors.background,
          paddingTop: insets.top,
          paddingBottom: insets.bottom,
        },
      ]}
      onPress={handlePress}
    >
      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.content} pointerEvents="box-none">
          <AppText style={[styles.title, { color: colors.textPrimary }]}>Welcome!</AppText>
          <AppText style={[styles.subtitle, { color: colors.textPrimary }]}>What should I call you?</AppText>
          <View pointerEvents="box-none" style={styles.inputContainer}>
            <AppTextInput
              style={[
                styles.input,
                {
                  backgroundColor: colors.surface,
                  color: colors.textPrimary,
                },
              ]}
              placeholder="Enter your name"
              placeholderTextColor={colors.textTertiary}
              value={name}
              onChangeText={setName}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={handleContinue}
              accessibilityLabel="Your name"
              accessibilityHint="Optional. Type your name to personalize the app."
            />
            <TouchableOpacity
              style={[styles.button, isSubmitting && styles.buttonDisabled]}
              onPress={handleContinue}
              disabled={isSubmitting}
              accessibilityRole="button"
              accessibilityLabel="Continue to get started"
              accessibilityState={{ disabled: isSubmitting }}
            >
              <AppText style={styles.buttonText}>Continue</AppText>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  keyboardView: {
    flex: 1,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  subtitle: {
    fontSize: 18,
    marginBottom: 32,
  },
  inputContainer: {
    width: '100%',
  },
  input: {
    width: '100%',
    height: 50,
    borderRadius: 10,
    paddingHorizontal: 16,
    fontSize: 16,
    marginBottom: 24,
  },
  button: {
    width: '100%',
    height: 50,
    backgroundColor: COLORS.lime800,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: COLORS.white,
    fontSize: 16,
    fontWeight: '600',
  },
});

export default WelcomeScreen;
