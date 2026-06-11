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
import type { TemplateSlot } from '../components/postcards/templates/sharedTypes';
import { useTheme } from '../context/ThemeContext';
import { useAppContext } from '../context/AppContext';
import { DEFAULT_POSTCARD_PHOTO_TRANSFORM, Postcard } from '../models/Postcard';
import { RootStackParamList } from '../navigation/types';
import { FONTS, FONT_WEIGHTS, SPACING } from '../config/constants';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const GRID_GAP = 12;
const LIST_HORIZONTAL_PADDING = SPACING.lg;
const CARD_WIDTH = (Dimensions.get('window').width - LIST_HORIZONTAL_PADDING * 2 - GRID_GAP) / 2;
const EDITOR_TEMPLATE_WIDTH = Dimensions.get('window').width - SPACING.lg * 2;
const THUMBNAIL_SCALE = Math.max(0.3, Math.min(1, CARD_WIDTH / EDITOR_TEMPLATE_WIDTH));

const ASPECT_RATIO_BY_KEY: Record<Postcard['aspectRatio'], number> = {
  '1:1': 1,
  '4:5': 4 / 5,
  '9:16': 9 / 16,
};

/** Normalize template IDs: 'two-photo-stack' or 'T11' → 'T-11' */
function normalizeTemplateId(id: string): string {
  if (id === 'two-photo-stack' || id === 'T11') return 'T-11';
  return id;
}

function loadTemplateComponent(templateId: string): React.ComponentType<any> | null {
  const norm = normalizeTemplateId(templateId);
  try {
    switch (norm) {
      case 'T-01':
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        return require('../components/postcards/templates/T01QuadCollageTemplate').default;
      case 'T-02':
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        return require('../components/postcards/templates/T02CameraViewfinderTemplate').default;
      case 'T-03':
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        return require('../components/postcards/templates/T03StatementCardTemplate').default;
      case 'T-04':
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        return require('../components/postcards/templates/T04LayeredScrapbookTemplate').default;
      case 'T-05':
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        return require('../components/postcards/templates/T05iMessageTemplate').default;
      case 'T-06':
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        return require('../components/postcards/templates/T06VerticalTriptychTemplate').default;
      case 'T-07':
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        return require('../components/postcards/templates/T07NotesJournalTemplate').default;
      case 'T-08':
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        return require('../components/postcards/templates/T08NotesDataLogTemplate').default;
      case 'T-09':
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        return require('../components/postcards/templates/T09MosaicCollageTemplate').default;
      case 'T-10':
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        return require('../components/postcards/templates/T10MinimalPhotoTemplate').default;
      case 'T-11':
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        return require('../components/postcards/templates/TwoPhotoStackTemplate').default;
      case 'T-12':
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        return require('../components/postcards/templates/T12TriptychBadgeTemplate').default;
      default:
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        return require('../components/postcards/templates/TwoPhotoStackTemplate').default;
    }
  } catch {
    return null;
  }
}

function buildSlotsFromPostcard(postcard: Postcard): TemplateSlot[] {
  const paths = [
    postcard.topPhotoPath,
    postcard.bottomPhotoPath,
    postcard.photo3Path ?? null,
    postcard.photo4Path ?? null,
  ];
  const transforms = [
    postcard.topPhotoTransform ?? DEFAULT_POSTCARD_PHOTO_TRANSFORM,
    postcard.bottomPhotoTransform ?? DEFAULT_POSTCARD_PHOTO_TRANSFORM,
    postcard.photo3Transform ?? DEFAULT_POSTCARD_PHOTO_TRANSFORM,
    postcard.photo4Transform ?? DEFAULT_POSTCARD_PHOTO_TRANSFORM,
  ];
  return paths.map((photoUri, i) => ({
    photoUri,
    transform: transforms[i] ?? DEFAULT_POSTCARD_PHOTO_TRANSFORM,
    resetKey: 0,
    entry: null,
  }));
}

const noop = () => {};

interface SavedPostcardThumbnailProps {
  postcard: Postcard;
}

const SavedPostcardThumbnail: React.FC<SavedPostcardThumbnailProps> = ({ postcard }) => {
  const templateId = normalizeTemplateId(postcard.templateId);
  const isT11 = templateId === 'T-11';
  const aspectRatio = ASPECT_RATIO_BY_KEY[postcard.aspectRatio];

  const TemplateComponent = useMemo(
    () => loadTemplateComponent(postcard.templateId),
    [postcard.templateId]
  );

  const slots = useMemo(() => buildSlotsFromPostcard(postcard), [postcard]);

  if (!TemplateComponent) {
    return null;
  }

  if (isT11) {
    return (
      <TemplateComponent
        topPhoto={postcard.topPhotoPath}
        bottomPhoto={postcard.bottomPhotoPath}
        onSlotPress={noop}
        onLabelPress={noop}
        onResetSlotFraming={noop}
        topLabel={postcard.topLabel}
        bottomLabel={postcard.bottomLabel}
        topTransform={postcard.topPhotoTransform ?? DEFAULT_POSTCARD_PHOTO_TRANSFORM}
        bottomTransform={postcard.bottomPhotoTransform ?? DEFAULT_POSTCARD_PHOTO_TRANSFORM}
        onTopTransformChange={noop}
        onBottomTransformChange={noop}
        aspectRatio={aspectRatio}
        previewMode
        scale={THUMBNAIL_SCALE}
        editingChromeSuppressed
      />
    );
  }

  return (
    <TemplateComponent
      slots={slots}
      onSlotPress={noop}
      onTransformChange={noop}
      onResetSlotFraming={noop}
      templateData={postcard.templateData ?? undefined}
      aspectRatio={aspectRatio}
      previewMode
      scale={THUMBNAIL_SCALE}
      editingChromeSuppressed
    />
  );
};

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
      accessibilityLabel={`Open postcard: ${item.topLabel || 'Untitled'}`}
    >
      <View style={styles.postcardShadow}>
        <SavedPostcardThumbnail postcard={item} />
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
