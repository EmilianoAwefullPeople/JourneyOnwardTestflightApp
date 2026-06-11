// SettingsScreen
// App settings: appearance, username, restart app.

import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Switch,
  Alert,
  Modal,
  Pressable,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, CommonActions } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import AppText from '../components/common/AppText';
import AppTextInput from '../components/common/AppTextInput';
import { MeshGradientBackground } from '../components/common/MeshGradientBackground';
import { FONTS, FONT_WEIGHTS, SPACING } from '../config/constants';
import { useTheme } from '../context/ThemeContext';
import { useAppContext } from '../context/AppContext';
import { logger } from '../utils/logger';
import LoadingSpinner from '../components/common/LoadingSpinner';

const DESTRUCTIVE_COLOR = '#c62828';

const SettingsScreen: React.FC = () => {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { colors, isDark, setColorScheme } = useTheme();
  const {
    userName,
    setUserName,
    resetApp,
    travelModeEnabled,
    setTravelMode,
    showHomeMap,
    setShowHomeMap,
    resetOnboarding,
  } = useAppContext();

  const [usernameModalVisible, setUsernameModalVisible] = useState(false);
  const [usernameInput, setUsernameInput] = useState(userName ?? '');
  const [savingName, setSavingName] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [restartingOnboarding, setRestartingOnboarding] = useState(false);


  const openUsernameModal = useCallback(() => {
    setUsernameInput(userName ?? '');
    setUsernameModalVisible(true);
  }, [userName]);

  const closeUsernameModal = useCallback(() => {
    setUsernameModalVisible(false);
    setSavingName(false);
  }, []);

  const handleSaveUsername = useCallback(async () => {
    const trimmed = usernameInput.trim();
    if (trimmed === (userName ?? '')) {
      closeUsernameModal();
      return;
    }
    setSavingName(true);
    try {
      await setUserName(trimmed);
      closeUsernameModal();
    } catch (error) {
      logger.error('Settings: save username failed', error);
      Alert.alert('Error', 'Could not save name. Please try again.');
    } finally {
      setSavingName(false);
    }
  }, [usernameInput, userName, setUserName, closeUsernameModal]);

  const handleAppearanceChange = useCallback(
    (value: boolean) => {
      setColorScheme(value ? 'dark' : 'light');
    },
    [setColorScheme]
  );

  const handleTravelModeToggle = useCallback(
    (value: boolean) => {
      if (!value && travelModeEnabled) {
        Alert.alert(
          'Turn off Travel Mode?',
          'Are you sure you want to turn it off?',
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Turn Off',
              onPress: () => setTravelMode(false, true),
            },
          ]
        );
      } else {
        setTravelMode(value);
      }
    },
    [travelModeEnabled, setTravelMode]
  );

  const handleRestartOnboarding = useCallback(() => {
    Alert.alert(
      'Restart onboarding?',
      'Your data and memories are kept. You\'ll see the onboarding sequence again on next open. Phase 0 fields will be pre-filled.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Restart Onboarding',
          onPress: async () => {
            setRestartingOnboarding(true);
            try {
              await resetOnboarding();
              navigation.dispatch(
                CommonActions.reset({ index: 0, routes: [{ name: 'OnboardingGate' }] })
              );
            } catch (error) {
              logger.error('Settings: restart onboarding failed', error);
              setRestartingOnboarding(false);
              Alert.alert('Error', 'Could not restart onboarding. Please try again.');
            }
          },
        },
      ]
    );
  }, [resetOnboarding, navigation]);

  const handleRestart = useCallback(() => {
    Alert.alert(
      'Restart app?',
      'All your data will be deleted and you will start from the beginning. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Restart',
          style: 'destructive',
          onPress: async () => {
            setResetting(true);
            try {
              await resetApp();
              navigation.dispatch(
                CommonActions.reset({ index: 0, routes: [{ name: 'OnboardingGate' }] })
              );
            } catch (error) {
              logger.error('Settings: reset failed', error);
              setResetting(false);
              Alert.alert('Error', 'Could not restart. Please try again.');
            }
          },
        },
      ]
    );
  }, [resetApp, navigation]);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: {
          flex: 1,
          backgroundColor: colors.background,
        },
        header: {
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: SPACING.md,
          paddingTop: insets.top + SPACING.sm,
          paddingBottom: SPACING.md,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
        },
        backButton: {
          width: 40,
          height: 40,
          borderRadius: 20,
          backgroundColor: colors.surfaceVariant,
          borderWidth: 1,
          borderColor: colors.border,
          alignItems: 'center',
          justifyContent: 'center',
          marginRight: SPACING.sm,
        },
        headerTitle: {
          fontFamily: FONTS.inter,
          fontSize: 18,
          fontWeight: FONT_WEIGHTS.semibold,
          color: colors.textPrimary,
        },
        scroll: {
          flex: 1,
        },
        scrollContent: {
          paddingBottom: Math.max(100, (Number.isFinite(insets.bottom) ? insets.bottom : 0) + 80),
        },
        sectionHeader: {
          fontFamily: FONTS.inter,
          fontSize: 12,
          fontWeight: FONT_WEIGHTS.semibold,
          color: colors.textSecondary,
          marginTop: SPACING.xl,
          marginBottom: SPACING.sm,
          marginHorizontal: SPACING.lg,
          letterSpacing: 0.5,
        },
        row: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingVertical: SPACING.md,
          paddingHorizontal: SPACING.lg,
          backgroundColor: colors.surface,
          borderTopWidth: 1,
          borderTopColor: colors.border,
        },
        rowFirst: {
          borderTopLeftRadius: 12,
          borderTopRightRadius: 12,
        },
        rowLast: {
          borderBottomLeftRadius: 12,
          borderBottomRightRadius: 12,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
        },
        rowSingle: {
          borderRadius: 12,
          borderWidth: 1,
          borderColor: colors.border,
        },
        rowLabel: {
          fontFamily: FONTS.inter,
          fontSize: 16,
          color: colors.textPrimary,
          flex: 1,
        },
        rowValue: {
          fontFamily: FONTS.inter,
          fontSize: 14,
          color: colors.textSecondary,
          marginRight: SPACING.sm,
        },
        rowDestructive: {
          backgroundColor: colors.surface,
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: 12,
          marginHorizontal: SPACING.lg,
          marginTop: SPACING.lg,
          paddingVertical: SPACING.md,
          paddingHorizontal: SPACING.lg,
          alignItems: 'center',
          justifyContent: 'center',
        },
        rowDestructiveText: {
          fontFamily: FONTS.inter,
          fontSize: 16,
          color: DESTRUCTIVE_COLOR,
        },
        sectionBlock: {
          marginHorizontal: SPACING.lg,
          borderRadius: 12,
          overflow: 'hidden',
          borderWidth: 1,
          borderColor: colors.border,
        },
        modalBackdrop: {
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
          padding: SPACING.lg,
          backgroundColor: 'rgba(0,0,0,0.4)',
        },
        modalCard: {
          width: '100%',
          maxWidth: 360,
          backgroundColor: colors.surface,
          borderRadius: 16,
          borderWidth: 1,
          borderColor: colors.border,
          padding: SPACING.xl,
        },
        modalTitle: {
          fontFamily: FONTS.inter,
          fontSize: 18,
          fontWeight: FONT_WEIGHTS.semibold,
          color: colors.textPrimary,
          marginBottom: SPACING.md,
        },
        modalInput: {
          backgroundColor: colors.surfaceVariant,
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: 12,
          paddingHorizontal: SPACING.md,
          paddingVertical: SPACING.sm,
          fontSize: 16,
          color: colors.textPrimary,
          marginBottom: SPACING.lg,
        },
        modalButton: {
          backgroundColor: colors.surfaceVariant,
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: 12,
          paddingVertical: SPACING.md,
          alignItems: 'center',
        },
        modalButtonText: {
          fontFamily: FONTS.inter,
          fontSize: 16,
          color: colors.textPrimary,
        },
      }),
    [colors, insets]
  );

  return (
    <View style={styles.container}>
      <MeshGradientBackground baseColor={colors.background} lightMode={!isDark} />
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Settings</Text>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator
      >
        <Text style={styles.sectionHeader}>APPEARANCE</Text>
        <View style={[styles.sectionBlock]}>
          <View style={[styles.row, styles.rowFirst, styles.rowLast, styles.rowSingle]}>
            <View>
              <Text style={styles.rowLabel}>Theme</Text>
              <Text style={styles.rowValue}>{isDark ? 'Dark' : 'Light'}</Text>
            </View>
            <Switch
              value={isDark}
              onValueChange={handleAppearanceChange}
              trackColor={{ false: colors.border, true: colors.borderLight }}
              thumbColor={colors.white}
              accessibilityLabel={isDark ? 'Dark mode on' : 'Light mode on'}
              accessibilityState={{ checked: isDark }}
            />
          </View>
        </View>

        <Text style={styles.sectionHeader}>TRAVEL</Text>
        <View style={[styles.sectionBlock]}>
          <View style={[styles.row, styles.rowFirst, styles.rowLast, styles.rowSingle]}>
            <View>
              <Text style={styles.rowLabel}>Travel Mode</Text>
              <Text style={styles.rowValue}>{travelModeEnabled ? 'On' : 'Off'}</Text>
            </View>
            <Switch
              value={travelModeEnabled}
              onValueChange={handleTravelModeToggle}
              trackColor={{ false: colors.border, true: '#34C759' }}
              thumbColor={colors.white}
              accessibilityLabel={travelModeEnabled ? 'Travel Mode on' : 'Travel Mode off'}
              accessibilityState={{ checked: travelModeEnabled }}
            />
          </View>
        </View>

        <Text style={styles.sectionHeader}>HOME</Text>
        <View style={[styles.sectionBlock]}>
          <View style={[styles.row, styles.rowFirst, styles.rowLast, styles.rowSingle]}>
            <View>
              <Text style={styles.rowLabel}>Show map</Text>
              <Text style={styles.rowValue}>{showHomeMap ? 'Visible' : 'Hidden'}</Text>
            </View>
            <Switch
              value={showHomeMap}
              onValueChange={setShowHomeMap}
              trackColor={{ false: colors.border, true: colors.borderLight }}
              thumbColor={colors.white}
              accessibilityLabel={showHomeMap ? 'Map visible' : 'Map hidden'}
              accessibilityState={{ checked: showHomeMap }}
            />
          </View>
        </View>

        <Text style={styles.sectionHeader}>ACCOUNT</Text>
        <View style={[styles.sectionBlock]}>
          <TouchableOpacity
            style={[styles.row, styles.rowFirst, styles.rowLast, styles.rowSingle]}
            onPress={openUsernameModal}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Change username"
          >
            <Text style={styles.rowLabel}>Username</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={styles.rowValue} numberOfLines={1}>
                {userName?.trim() || 'Set name'}
              </Text>
              <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
            </View>
          </TouchableOpacity>
        </View>

        <Text style={styles.sectionHeader}>APP</Text>
        <View style={[styles.sectionBlock]}>
          <TouchableOpacity
            style={[styles.row, styles.rowFirst, styles.rowLast, styles.rowSingle]}
            onPress={handleRestartOnboarding}
            disabled={restartingOnboarding}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Restart onboarding"
          >
            <Text style={styles.rowLabel}>Restart Onboarding</Text>
            {restartingOnboarding ? (
              <LoadingSpinner size="small" />
            ) : (
              <Ionicons name="refresh-outline" size={20} color={colors.textSecondary} />
            )}
          </TouchableOpacity>
        </View>
        <TouchableOpacity
          style={styles.rowDestructive}
          onPress={handleRestart}
          disabled={resetting}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Restart app and delete all data"
        >
          {resetting ? (
            <LoadingSpinner size="small" color={DESTRUCTIVE_COLOR} />
          ) : (
            <AppText style={styles.rowDestructiveText}>Restart app</AppText>
          )}
        </TouchableOpacity>

      </ScrollView>

      <Modal
        visible={usernameModalVisible}
        transparent
        animationType="fade"
        onRequestClose={closeUsernameModal}
        statusBarTranslucent
      >
        <Pressable style={styles.modalBackdrop} onPress={closeUsernameModal}>
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
            <KeyboardAvoidingView
              behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            >
              <Text style={styles.modalTitle}>Username</Text>
              <AppTextInput
                style={styles.modalInput}
                value={usernameInput}
                onChangeText={setUsernameInput}
                placeholder="Your name"
                placeholderTextColor={colors.textSecondary}
                editable={!savingName}
                accessibilityLabel="Your name"
              />
              <TouchableOpacity
                style={styles.modalButton}
                onPress={handleSaveUsername}
                disabled={savingName}
                accessibilityRole="button"
                accessibilityLabel="Save name"
              >
                {savingName ? (
                  <LoadingSpinner size="small" />
                ) : (
                  <Text style={styles.modalButtonText}>Save</Text>
                )}
              </TouchableOpacity>
            </KeyboardAvoidingView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
};

export default SettingsScreen;
