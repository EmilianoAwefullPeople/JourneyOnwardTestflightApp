import React, { useMemo } from 'react';
import { View, ScrollView, Image, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AppText from '../common/AppText';
import { useTheme } from '../../context/ThemeContext';
import { useAppContext } from '../../context/AppContext';
import { FONTS, FONT_WEIGHTS, SPACING } from '../../config/constants';
import { Entry } from '../../models/Entry';

const CARD_WIDTH = 130;
const CARD_HEIGHT = 130;
const CARD_RADIUS = 12;

function getFirstImageUri(entry: Entry): string {
  return (
    (entry.photoPaths && entry.photoPaths[0]) ||
    (entry.mediaPaths && entry.mediaPaths[0]) ||
    (entry.storageUrls && entry.storageUrls[0]) ||
    ''
  );
}

function hashString(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededShuffle<T>(items: T[], seed: string, keyOf: (item: T) => string): T[] {
  return [...items].sort((a, b) => {
    const ah = hashString(`${seed}:${keyOf(a)}`);
    const bh = hashString(`${seed}:${keyOf(b)}`);
    return ah - bh;
  });
}

interface StudioPostcardsRowProps {
  sessionSeed: string;
}

const StudioPostcardsRow: React.FC<StudioPostcardsRowProps> = ({ sessionSeed }) => {
  const { colors } = useTheme();
  const { entries } = useAppContext();

  const previewPhotos = useMemo(() => {
    const eligible = entries.filter((e) => e.type === 'experience' && !e.isDraft);
    return seededShuffle(eligible, sessionSeed, (e) => e.id)
      .map((e) => getFirstImageUri(e))
      .filter(Boolean)
      .slice(0, 3);
  }, [entries, sessionSeed]);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        headerRow: {
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 12,
        },
        headerLabel: {
          fontFamily: FONTS.inter,
          fontSize: 16,
          fontWeight: FONT_WEIGHTS.semibold,
          color: colors.textPrimary,
        },
        headerLink: {
          fontFamily: FONTS.inter,
          fontSize: 13,
          fontWeight: FONT_WEIGHTS.regular,
          color: colors.textSecondary,
        },
        scroll: {
          marginHorizontal: -SPACING.lg,
        },
        scrollContent: {
          paddingHorizontal: SPACING.lg,
          gap: 12,
        },
        templateCard: {
          width: CARD_WIDTH,
          height: CARD_HEIGHT,
          borderRadius: CARD_RADIUS,
          backgroundColor: colors.surfaceVariant,
          borderWidth: 1,
          borderColor: colors.border,
          alignItems: 'center',
          justifyContent: 'center',
        },
        templateLabel: {
          fontFamily: FONTS.inter,
          fontSize: 14,
          fontWeight: FONT_WEIGHTS.semibold,
          color: colors.textPrimary,
          marginTop: 8,
        },
        photoCard: {
          width: CARD_WIDTH,
          height: CARD_HEIGHT,
          borderRadius: CARD_RADIUS,
          overflow: 'hidden',
          backgroundColor: colors.surfaceVariant,
        },
        photo: {
          width: '100%',
          height: '100%',
        },
      }),
    [colors]
  );

  return (
    <View>
      <View style={styles.headerRow}>
        <AppText style={styles.headerLabel}>Create postcards</AppText>
        <AppText style={styles.headerLink} accessibilityRole="text">
          Saved postcards
        </AppText>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
      >
        <View style={styles.templateCard} accessibilityElementsHidden>
          <Ionicons name="grid-outline" size={24} color={colors.textPrimary} />
          <AppText style={styles.templateLabel}>Templates</AppText>
        </View>
        {previewPhotos.map((uri, i) => (
          <View key={i} style={styles.photoCard} accessibilityElementsHidden>
            <Image source={{ uri }} style={styles.photo} resizeMode="cover" accessibilityIgnoresInvertColors />
          </View>
        ))}
      </ScrollView>
    </View>
  );
};

export default StudioPostcardsRow;
