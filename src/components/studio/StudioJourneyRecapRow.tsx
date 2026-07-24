import React, { useMemo } from 'react';
import { View, ScrollView, Image, TouchableOpacity, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import AppText from '../common/AppText';
import { useTheme } from '../../context/ThemeContext';
import { useAppContext } from '../../context/AppContext';
import { RootStackParamList } from '../../navigation/types';
import { FONTS, FONT_WEIGHTS, SPACING } from '../../config/constants';
import { TripAlbum } from '../../models/TripAlbum';
import { Entry } from '../../models/Entry';
import { isTripFinished } from '../../utils/albumUtils';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const CARD_WIDTH = 130;
const CARD_HEIGHT = 130;
const CARD_RADIUS = 12;

function getFirstImageUri(entry: Entry): string {
  return (
    (entry.photoPaths && entry.photoPaths[0]) ||
    (entry.mediaPaths && entry.mediaPaths[0]) ||
    ''
  );
}

interface AlbumCard {
  album: TripAlbum;
  imageUri: string;
}

const StudioJourneyRecapRow: React.FC = () => {
  const navigation = useNavigation<Nav>();
  const { colors } = useTheme();
  const { tripAlbums, entries } = useAppContext();

  const albumCards = useMemo<AlbumCard[]>(() => {
    const sorted = [...tripAlbums].sort(
      (a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime()
    );

    const cards: AlbumCard[] = [];
    for (const album of sorted) {
      if (!isTripFinished(album)) continue;
      const photoEntry = entries.find(
        (e) => e.albumId === album.id && !!getFirstImageUri(e)
      );
      if (!photoEntry) continue;
      cards.push({ album, imageUri: getFirstImageUri(photoEntry) });
    }
    return cards;
  }, [tripAlbums, entries]);

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
        card: {
          width: CARD_WIDTH,
        },
        imageWrapper: {
          width: CARD_WIDTH,
          height: CARD_HEIGHT,
          borderRadius: CARD_RADIUS,
          overflow: 'hidden',
          backgroundColor: colors.surfaceVariant,
        },
        image: {
          width: '100%',
          height: '100%',
        },
        albumName: {
          fontFamily: FONTS.inter,
          fontSize: 12,
          fontWeight: FONT_WEIGHTS.regular,
          color: colors.textPrimary,
          marginTop: 6,
        },
      }),
    [colors]
  );

  if (albumCards.length === 0) return null;

  return (
    <View>
      <View style={styles.headerRow}>
        <AppText style={styles.headerLabel}>Journey recap</AppText>
        <AppText style={styles.headerLink} accessibilityRole="text">
          Saved recaps
        </AppText>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
      >
        {albumCards.map(({ album, imageUri }) => (
          <TouchableOpacity
            key={album.id}
            style={styles.card}
            onPress={() => navigation.navigate('JourneyRecapPlayer', { albumId: album.id })}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel={`${album.name} — generate journey recap`}
          >
            <View style={styles.imageWrapper}>
              <Image
                source={{ uri: imageUri }}
                style={styles.image}
                resizeMode="cover"
                accessibilityIgnoresInvertColors
              />
            </View>
            <AppText style={styles.albumName} numberOfLines={1}>
              {album.name}
            </AppText>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
};

export default StudioJourneyRecapRow;
