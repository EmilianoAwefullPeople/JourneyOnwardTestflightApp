import React, { useMemo } from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import AppText from '../common/AppText';
import { useTheme } from '../../context/ThemeContext';
import { RootStackParamList } from '../../navigation/types';
import { FONTS, FONT_WEIGHTS } from '../../config/constants';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const CARD_HEIGHT = 96;
const CARD_GAP = 10;

const ACTIONS = [
  { label: 'Add Past\nMemories', icon: 'image-outline', screen: 'AddPastExperiences' },
  { label: 'Sync From\nGallery', icon: 'sync-outline', screen: 'ImportLatest' },
  { label: 'Create Trip\nAlbum', icon: 'book-outline', screen: 'TripAlbumCreate' },
] as const;

const StudioQuickActions: React.FC = () => {
  const navigation = useNavigation<Nav>();
  const { colors } = useTheme();

  const styles = useMemo(
    () =>
      StyleSheet.create({
        label: {
          fontFamily: FONTS.inter,
          fontSize: 16,
          fontWeight: FONT_WEIGHTS.semibold,
          color: colors.textPrimary,
          marginBottom: 12,
        },
        row: {
          flexDirection: 'row',
          gap: CARD_GAP,
        },
        card: {
          flex: 1,
          height: CARD_HEIGHT,
          borderRadius: 16,
          backgroundColor: colors.surfaceVariant,
          borderWidth: 1,
          borderColor: colors.border,
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          paddingHorizontal: 6,
        },
        cardLabel: {
          fontFamily: FONTS.inter,
          fontSize: 11,
          fontWeight: FONT_WEIGHTS.semibold,
          color: colors.textPrimary,
          textAlign: 'center',
          lineHeight: 14,
        },
      }),
    [colors]
  );

  return (
    <View>
      <AppText style={styles.label}>Quick actions</AppText>
      <View style={styles.row}>
        {ACTIONS.map((action) => (
          <TouchableOpacity
            key={action.screen}
            style={styles.card}
            onPress={() => navigation.navigate(action.screen as any)}
            activeOpacity={0.75}
            accessibilityRole="button"
            accessibilityLabel={action.label.replace('\n', ' ')}
          >
            <Ionicons name={action.icon as any} size={26} color={colors.textPrimary} />
            <AppText style={styles.cardLabel}>{action.label}</AppText>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
};

export default StudioQuickActions;
