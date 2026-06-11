// AddPastExperiencesScreen
// Gallery-picker entry point that feeds into the same CaptureReviewView → CaptureSaved flow
// used by the live camera capture. Only difference: photos come from the library and
// EXIF timestamp/GPS are used instead of current time/location.

import React, { useState, useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { FONTS, FONT_WEIGHTS } from '../config/constants';
import { useTheme } from '../context/ThemeContext';
import type { ThemeColors } from '../config/theme';
import { MeshGradientBackground } from '../components/common/MeshGradientBackground';
import BackArrow from '../components/common/icons/BackArrow';
import CaptureReviewView from '../components/capture/CaptureReviewView';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { getDecimalCoordinatesFromExif } from '../utils/exifGps';
import { logger } from '../utils/logger';

type AddPastExperiencesNavigationProp = NativeStackNavigationProp<RootStackParamList, 'AddPastExperiences'>;

type Phase = 'selection' | 'review';

const MAX_PHOTOS = 3;

const AddPastExperiencesScreen: React.FC = () => {
  const navigation = useNavigation<AddPastExperiencesNavigationProp>();
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();

  const [phase, setPhase] = useState<Phase>('selection');
  const [selectedPhotos, setSelectedPhotos] = useState<string[]>([]);
  const [exifTimestamp, setExifTimestamp] = useState<string | undefined>();
  const [exifLocation, setExifLocation] = useState<{ latitude: number; longitude: number } | undefined>();
  const [exifAltitude, setExifAltitude] = useState<number | undefined>();

  const styles = useMemo(() => createStyles(colors), [colors]);
  const { width: windowWidth } = useWindowDimensions();
  const scaleFactor = Math.min(Math.max(windowWidth, 320), 430) / 390;

  const parseExifDate = (exifDate: string): string => {
    if (!exifDate) return new Date().toISOString();
    try {
      const [datePart, timePart] = exifDate.split(' ');
      const [year, month, day] = datePart.split(':');
      return new Date(`${year}-${month}-${day}T${timePart}`).toISOString();
    } catch (_) {
      return new Date().toISOString();
    }
  };

  const pickImages = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Denied', 'We need camera roll permissions to add past memories.');
      return;
    }

    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: 'images',
        allowsMultipleSelection: true,
        selectionLimit: MAX_PHOTOS,
        quality: 1,
        exif: true,
      });

      if (result.canceled) return;

      const uris = result.assets.slice(0, MAX_PHOTOS).map(a => a.uri);
      if (result.assets.length > MAX_PHOTOS) Alert.alert('Limit', `Max ${MAX_PHOTOS} photos.`);

      // Extract EXIF from the first selected image
      const firstAsset = result.assets[0];
      const exif = firstAsset?.exif;

      const ts = exif?.DateTimeOriginal
        ? parseExifDate(exif.DateTimeOriginal)
        : new Date().toISOString();

      const coords = getDecimalCoordinatesFromExif(exif ?? undefined);
      const altRaw = exif?.GPSAltitude;
      const alt = typeof altRaw === 'number' && Number.isFinite(altRaw) ? altRaw : undefined;

      setSelectedPhotos(uris);
      setExifTimestamp(ts);
      setExifLocation(coords ?? undefined);
      setExifAltitude(alt);
      setPhase('review');
    } catch (error) {
      logger.error('AddPastExperiences: pick error', error);
      Alert.alert('Error', 'Failed to pick images. Please try again.');
    }
  };

  if (phase === 'review') {
    return (
      <CaptureReviewView
        photos={selectedPhotos}
        exifTimestamp={exifTimestamp}
        exifLocation={exifLocation}
        exifAltitude={exifAltitude}
        onBack={(remaining) => {
          if (remaining.length === 0) {
            setPhase('selection');
            setSelectedPhotos([]);
          } else {
            setSelectedPhotos(remaining);
          }
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

  // Selection phase
  const safeTop = Number.isFinite(insets.top) ? insets.top : 0;

  return (
    <View style={styles.container}>
      <MeshGradientBackground baseColor={colors.background} lightMode={!isDark} />

      <TouchableOpacity
        style={[styles.backButton, { top: safeTop + 12 * scaleFactor, left: 18 * scaleFactor }]}
        onPress={() => navigation.goBack()}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel="Back"
      >
        <BackArrow width={23.75 * scaleFactor} height={26.25 * scaleFactor} color={colors.textPrimary} />
      </TouchableOpacity>

      <View style={styles.content}>
        <Ionicons name="image-outline" size={72} color={colors.textPrimary} style={styles.icon} />
        <Text style={[styles.title, { fontSize: 22 * scaleFactor }]}>Add Memories From Past Adventures</Text>
        <TouchableOpacity style={styles.selectButton} onPress={pickImages} activeOpacity={0.8}>
          <Text style={[styles.selectButtonText, { fontSize: 16 * scaleFactor }]}>Tap To Select Photos</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    backButton: { position: 'absolute', zIndex: 100, justifyContent: 'center', alignItems: 'center' },
    content: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: 32,
    },
    icon: { marginBottom: 24 },
    title: {
      fontFamily: FONTS.playfairDisplay,
      fontStyle: 'italic',
      color: colors.textPrimary,
      textAlign: 'center',
      marginBottom: 40,
      maxWidth: 300,
    },
    selectButton: {
      backgroundColor: colors.surface,
      paddingVertical: 16,
      paddingHorizontal: 32,
      borderRadius: 30,
      width: '100%',
      maxWidth: 280,
      alignItems: 'center',
    },
    selectButtonText: {
      fontFamily: FONTS.inter,
      fontWeight: FONT_WEIGHTS.semibold,
      color: colors.textPrimary,
    },
  });
}

export default AddPastExperiencesScreen;
