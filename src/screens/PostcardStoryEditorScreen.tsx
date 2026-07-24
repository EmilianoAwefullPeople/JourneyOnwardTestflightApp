import React, { useMemo } from 'react';
import { View, Image, TouchableOpacity, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import AppText from '../components/common/AppText';
import { RootStackParamList } from '../navigation/types';
import { FONTS, FONT_WEIGHTS, SPACING } from '../config/constants';

type Props = NativeStackScreenProps<RootStackParamList, 'PostcardStoryEditor'>;

/**
 * Placeholder for the Instagram-Stories-style graphic editor opened from the
 * Gallery tab. The real editor is a future project — this screen just confirms
 * the selected photo and gives users a way back.
 */
const PostcardStoryEditorScreen: React.FC<Props> = ({ route }) => {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { photoUri } = route.params;

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: {
          flex: 1,
          backgroundColor: '#000',
        },
        backButton: {
          position: 'absolute',
          top: insets.top + 8,
          left: SPACING.lg,
          width: 40,
          height: 40,
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1,
        },
        photo: {
          ...StyleSheet.absoluteFillObject,
        },
        overlay: {
          ...StyleSheet.absoluteFillObject,
          backgroundColor: 'rgba(0,0,0,0.45)',
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: SPACING.xl,
          gap: 12,
        },
        title: {
          fontFamily: FONTS.inter,
          fontSize: 20,
          fontWeight: FONT_WEIGHTS.bold,
          color: '#fff',
          textAlign: 'center',
        },
        subtitle: {
          fontFamily: FONTS.inter,
          fontSize: 14,
          color: 'rgba(255,255,255,0.8)',
          textAlign: 'center',
        },
      }),
    [insets]
  );

  return (
    <View style={styles.container}>
      <Image source={{ uri: photoUri }} style={styles.photo} resizeMode="cover" accessibilityIgnoresInvertColors />
      <View style={styles.overlay}>
        <Ionicons name="sparkles-outline" size={40} color="#fff" />
        <AppText style={styles.title}>Story editor coming soon</AppText>
        <AppText style={styles.subtitle}>
          Drawing, text, and stickers for this photo are on the way.
        </AppText>
      </View>
      <TouchableOpacity
        style={styles.backButton}
        onPress={() => navigation.goBack()}
        accessibilityRole="button"
        accessibilityLabel="Go back"
      >
        <Ionicons name="chevron-back" size={24} color="#fff" />
      </TouchableOpacity>
    </View>
  );
};

export default PostcardStoryEditorScreen;
