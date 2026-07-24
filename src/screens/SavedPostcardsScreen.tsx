import React, { useMemo } from 'react';
import {
  View,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import AppText from '../components/common/AppText';
import PostcardThumbnail from '../components/postcards/PostcardThumbnail';
import { useTheme } from '../context/ThemeContext';
import { useAppContext } from '../context/AppContext';
import { Postcard } from '../models/Postcard';
import { RootStackParamList } from '../navigation/types';
import { FONTS, FONT_WEIGHTS, SPACING } from '../config/constants';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const GRID_GAP = 12;
const LIST_HORIZONTAL_PADDING = SPACING.lg;
const CARD_WIDTH = (Dimensions.get('window').width - LIST_HORIZONTAL_PADDING * 2 - GRID_GAP) / 2;

const SavedPostcardsScreen: React.FC = () => {
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { postcards } = useAppContext();

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
          paddingTop: insets.top + 8,
          paddingHorizontal: SPACING.lg,
          paddingBottom: 16,
        },
        backButton: {
          width: 40,
          height: 40,
          alignItems: 'center',
          justifyContent: 'center',
          marginRight: 4,
        },
        title: {
          fontFamily: FONTS.inter,
          fontSize: 20,
          fontWeight: FONT_WEIGHTS.bold,
          color: colors.textPrimary,
          flex: 1,
        },
        list: {
          paddingHorizontal: LIST_HORIZONTAL_PADDING,
          paddingBottom: insets.bottom + 24,
        },
        item: {
          width: CARD_WIDTH,
          marginBottom: GRID_GAP,
          borderRadius: 12,
          overflow: 'hidden',
        },
        postcardShadow: {
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.18,
          shadowRadius: 10,
          elevation: 6,
        },
        empty: {
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          gap: 12,
          paddingBottom: 80,
        },
        emptyTitle: {
          fontFamily: FONTS.inter,
          fontSize: 17,
          fontWeight: FONT_WEIGHTS.semibold,
          color: colors.textPrimary,
        },
        emptySubtitle: {
          fontFamily: FONTS.inter,
          fontSize: 14,
          color: colors.textSecondary,
          textAlign: 'center',
          paddingHorizontal: 40,
        },
      }),
    [colors, insets]
  );

  const renderItem = ({ item }: { item: Postcard }) => (
    <TouchableOpacity
      style={styles.item}
      onPress={() => navigation.navigate('PostcardEditor', { postcardId: item.id })}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={`Open postcard: ${item.label1 || 'Untitled'}`}
    >
      <View style={styles.postcardShadow}>
        <PostcardThumbnail postcard={item} width={CARD_WIDTH} />
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <AppText style={styles.title}>Saved Postcards</AppText>
      </View>

      {postcards.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="bookmark-outline" size={48} color={colors.textSecondary} />
          <AppText style={styles.emptyTitle}>No saved postcards</AppText>
          <AppText style={styles.emptySubtitle}>
            Create a postcard using the + button and tap Save to store it here.
          </AppText>
        </View>
      ) : (
        <FlatList
          data={postcards}
          keyExtractor={(p) => p.id}
          renderItem={renderItem}
          numColumns={2}
          columnWrapperStyle={{ gap: GRID_GAP }}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
};

export default SavedPostcardsScreen;
