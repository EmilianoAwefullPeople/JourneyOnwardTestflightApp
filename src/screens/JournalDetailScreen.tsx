// JournalDetailScreen
// Full-screen view for reading complete journal entries

import React, { useEffect, useState, useRef, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Animated, Easing, Alert, TouchableWithoutFeedback, useWindowDimensions, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { useAppContext } from '../context/AppContext';
import { COLORS, DIMENSIONS, FONT_WEIGHTS, FONTS, SPACING } from '../config/constants';
import { logger } from '../utils/logger';
import { useTheme } from '../context/ThemeContext';
import BackArrow from '../components/common/icons/BackArrow';

type JournalDetailRouteProp = RouteProp<RootStackParamList, 'JournalDetail'>;
type JournalDetailNavigationProp = NativeStackNavigationProp<RootStackParamList>;

const JournalDetailScreen: React.FC = () => {
  const navigation = useNavigation<JournalDetailNavigationProp>();
  const route = useRoute<JournalDetailRouteProp>();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { journals, deleteJournal } = useAppContext();
  const { journalId } = route.params;

  const [locationName, setLocationName] = useState<string>('');

  // Menu state for 3-dots
  const [menuVisible, setMenuVisible] = useState(false);
  const [menuExiting, setMenuExiting] = useState(false);
  const menuOverlayOpacity = useRef(new Animated.Value(0)).current;
  const menuDropdownScale = useRef(new Animated.Value(0.92)).current;

  // Responsive dimensions (safe area so header clears notch)
  const { width: screenWidth } = useWindowDimensions();
  const scaleFactor = screenWidth / 390;
  const topBarTop = insets.top + (107.07 - 74 + 20) * scaleFactor;

  // Find journal
  const journal = journals.find(j => j.id === journalId);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: { flex: 1, backgroundColor: colors.background },
        header: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 100, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 25 },
        backButton: { position: 'absolute', zIndex: 10, padding: 8 },
        menuButton: { position: 'absolute', zIndex: 100, padding: 8, paddingHorizontal: 12 },
        menuButtonText: { fontFamily: FONTS.inter, fontSize: 24, fontWeight: FONT_WEIGHTS.bold, color: colors.textPrimary, lineHeight: 24 },
        menuOverlay: { ...StyleSheet.absoluteFillObject, zIndex: 200, backgroundColor: 'rgba(0,0,0,0.3)' },
        menuDropdown: {
          position: 'absolute',
          backgroundColor: colors.surface,
          borderRadius: 8,
          minWidth: 120,
          paddingVertical: 4,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.3,
          shadowRadius: 4,
          elevation: 8,
        },
        menuOption: { paddingVertical: 12, paddingHorizontal: 16 },
        menuOptionText: { fontFamily: FONTS.inter, fontSize: 16, color: colors.textPrimary },
        menuOptionTextDanger: { color: '#DC2626' },
        scrollView: { flex: 1 },
        scrollContent: { padding: 20 },
        contentCard: {
          backgroundColor: colors.surface,
          borderRadius: DIMENSIONS.cardBorderRadius,
          padding: 24,
        },
        date: {
          fontSize: 17,
          color: colors.textSecondary,
          fontFamily: Platform.OS === 'ios' ? 'Georgia' : FONTS.playfairDisplay,
          marginBottom: 1,
          lineHeight: 22,
        },
        location: {
          fontSize: 17,
          color: colors.textSecondary,
          fontFamily: Platform.OS === 'ios' ? 'Georgia' : FONTS.playfairDisplay,
          marginBottom: 6,
          lineHeight: 22,
        },
        content: {
          fontSize: 15,
          color: colors.textPrimary,
          fontFamily: Platform.OS === 'ios' ? 'Georgia' : FONTS.playfairDisplay,
          lineHeight: 23,
          marginBottom: 0,
        },
        errorContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 20 },
        errorText: { fontSize: 18, color: colors.textPrimary, fontFamily: FONTS.inter, fontWeight: FONT_WEIGHTS.semibold },
      }),
    [colors]
  );

  // Reverse geocode location
  useEffect(() => {
    const getLocationName = async () => {
      if (!journal?.latitude || !journal?.longitude) {
        setLocationName('');
        return;
      }

      try {
        const locationModule = await import('expo-location');
        const [address] = await locationModule.reverseGeocodeAsync({
          latitude: journal.latitude,
          longitude: journal.longitude,
        });

        if (address) {
          const parts = [];
          if (address.city) parts.push(address.city);
          if (address.region) parts.push(address.region);
          if (address.country) parts.push(address.country);
          setLocationName(parts.join(', '));
        } else {
          setLocationName('');
        }
      } catch (error) {
        logger.log('Could not reverse geocode:', error);
        setLocationName('');
      }
    };

    getLocationName();
  }, [journal]);

  // Menu open/close animations
  useEffect(() => {
    if (menuVisible && !menuExiting) {
      menuOverlayOpacity.setValue(0);
      menuDropdownScale.setValue(0.92);
      Animated.parallel([
        Animated.timing(menuOverlayOpacity, {
          toValue: 1,
          duration: 200,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(menuDropdownScale, {
          toValue: 1,
          duration: 220,
          easing: Easing.bezier(0.16, 1, 0.3, 1),
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [menuVisible, menuExiting]);

  const closeMenuAnimated = (callback?: () => void) => {
    if ((!menuVisible && !menuExiting) || menuExiting) return;
    setMenuExiting(true);
    Animated.parallel([
      Animated.timing(menuOverlayOpacity, {
        toValue: 0,
        duration: 150,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(menuDropdownScale, {
        toValue: 0.92,
        duration: 150,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      if (finished) {
        setMenuVisible(false);
        setMenuExiting(false);
        if (callback) callback();
      }
    });
  };

  const handleEdit = () => {
    closeMenuAnimated(() => {
      Alert.alert('Not available', 'Journal editing will be available in a future update.');
    });
  };

  const handleDelete = () => {
    closeMenuAnimated(() => {
      Alert.alert(
        'Are you sure you want to delete this journal entry?',
        undefined,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Yes, delete.',
            style: 'destructive',
            onPress: async () => {
              try {
                await deleteJournal(journalId);
                navigation.goBack();
              } catch (error) {
                Alert.alert('Error', 'Failed to delete journal. Please try again.');
              }
            },
          },
        ]
      );
    });
  };

  if (!journal) {
    return (
      <View style={styles.container}>
        <View style={[styles.header, { paddingTop: topBarTop }]}>
          <TouchableOpacity
            style={[styles.backButton, { left: 25 * scaleFactor }]}
            onPress={() => navigation.goBack()}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Back"
          >
            <BackArrow width={19 * scaleFactor} height={21 * scaleFactor} color={colors.textPrimary} />
          </TouchableOpacity>
        </View>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>Journal not found</Text>
        </View>
      </View>
    );
  }

  // Match Home journal card date format.
  const date = new Date(journal.timestamp);
  const formattedDate = date.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: topBarTop }]}>
        <TouchableOpacity
          style={[styles.backButton, { left: 25 * scaleFactor }]}
          onPress={() => navigation.goBack()}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <BackArrow width={19 * scaleFactor} height={21 * scaleFactor} color={colors.textPrimary} />
        </TouchableOpacity>

        {/* 3-dots menu button */}
        <TouchableOpacity
          style={[styles.menuButton, { right: 25 * scaleFactor }]}
          onPress={() => (menuVisible || menuExiting) ? closeMenuAnimated() : setMenuVisible(true)}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Journal options"
        >
          <Text style={styles.menuButtonText}>...</Text>
        </TouchableOpacity>
      </View>

      {/* Menu overlay - smooth open/close animation */}
      {(menuVisible || menuExiting) && (
        <Animated.View style={[styles.menuOverlay, { opacity: menuOverlayOpacity }]} pointerEvents="box-none">
          <TouchableWithoutFeedback onPress={() => closeMenuAnimated()}>
            <View style={StyleSheet.absoluteFill} />
          </TouchableWithoutFeedback>
          <Animated.View style={[styles.menuDropdown, { top: topBarTop + 40, right: 25 * scaleFactor, transform: [{ scale: menuDropdownScale }] }]} pointerEvents="box-none">
            <TouchableOpacity style={styles.menuOption} onPress={handleEdit} accessibilityRole="button" accessibilityLabel="Edit journal" activeOpacity={0.7}>
              <Text style={styles.menuOptionText}>Edit</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.menuOption} onPress={handleDelete} accessibilityRole="button" accessibilityLabel="Delete journal" activeOpacity={0.7}>
              <Text style={[styles.menuOptionText, styles.menuOptionTextDanger]}>Delete</Text>
            </TouchableOpacity>
          </Animated.View>
        </Animated.View>
      )}

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.scrollContent, { paddingTop: topBarTop + 60, paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.contentCard}>
          <Text style={styles.date}>{formattedDate}</Text>
          {locationName.trim().length > 0 ? <Text style={styles.location}>{locationName}</Text> : null}
          <Text style={styles.content}>{journal.content}</Text>
        </View>
      </ScrollView>
    </View>
  );
};

export default JournalDetailScreen;
