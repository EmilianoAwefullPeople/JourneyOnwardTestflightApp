import React, { useMemo } from 'react';
import {
  View,
  Image,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Dimensions,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import AppText from '../common/AppText';
import { useTheme } from '../../context/ThemeContext';
import { useAppContext } from '../../context/AppContext';
import { RootStackParamList } from '../../navigation/types';
import { FONTS, FONT_WEIGHTS, SPACING } from '../../config/constants';
import { Entry } from '../../models/Entry';
import { formatEntryDate } from '../../utils/dateUtils';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const { width: SCREEN_WIDTH } = Dimensions.get('window');
// Each card is ~45% of screen width so two are visible at a time with a peek of the third
const CELL_WIDTH = SCREEN_WIDTH * 0.44;
const IMAGE_HEIGHT = CELL_WIDTH * (4 / 3);
const MAX_CARDS = 12;

type MissingField = 'title' | 'description' | 'emotion' | 'journal';

const FIELD_QUESTIONS: Record<MissingField, string> = {
  title: "What's a good title?",
  description: "What's the story?",
  emotion: 'How did this feel?',
  journal: 'Want to write about this?',
};

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

function hasEmotionData(entry: Entry): boolean {
  if (Array.isArray(entry.emotionLabels) && entry.emotionLabels.length > 0) return true;
  if (typeof entry.emotionNote === 'string' && entry.emotionNote.trim().length > 0) return true;
  return entry.valence != null || entry.arousal != null;
}

function getMissingField(entry: Entry, linkedJournalEntryIds: Set<string>): MissingField | null {
  if (!entry.title || entry.title.trim() === '') return 'title';
  if (!entry.description || entry.description.trim() === '') return 'description';
  if (!hasEmotionData(entry)) return 'emotion';
  const hasJournal =
    (typeof entry.journalId === 'string' && entry.journalId.trim().length > 0) ||
    linkedJournalEntryIds.has(entry.id);
  if (!hasJournal) return 'journal';
  return null;
}

function getFirstImageUri(entry: Entry): string {
  return (
    (entry.photoPaths && entry.photoPaths[0]) ||
    (entry.mediaPaths && entry.mediaPaths[0]) ||
    (entry.storageUrls && entry.storageUrls[0]) ||
    ''
  );
}

interface RowItem {
  entryId: string;
  imageUri: string;
  question: string;
  field: MissingField;
  dateLabel: string;
}

interface StudioAddMoreDetailsProps {
  sessionSeed: string;
}

const StudioAddMoreDetails: React.FC<StudioAddMoreDetailsProps> = ({ sessionSeed }) => {
  const navigation = useNavigation<Nav>();
  const { colors } = useTheme();
  const { entries, journals } = useAppContext();

  const linkedJournalEntryIds = useMemo(() => {
    const ids = new Set<string>();
    for (const j of journals) {
      if (j.linkedEntryId) ids.add(j.linkedEntryId);
    }
    return ids;
  }, [journals]);

  const rowItems = useMemo<RowItem[]>(() => {
    const items: RowItem[] = [];
    const shuffled = seededShuffle(
      entries.filter((e) => e.type === 'experience' && !e.isDraft),
      sessionSeed,
      (e) => e.id
    );

    for (const entry of shuffled) {
      if (items.length >= MAX_CARDS) break;
      const field = getMissingField(entry, linkedJournalEntryIds);
      if (!field) continue;
      const imageUri = getFirstImageUri(entry);
      if (!imageUri) continue;
      items.push({
        entryId: entry.id,
        imageUri,
        question: FIELD_QUESTIONS[field],
        field,
        dateLabel: formatEntryDate(entry.timestamp),
      });
    }
    return items;
  }, [entries, journals, linkedJournalEntryIds, sessionSeed]);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        sectionLabel: {
          fontFamily: FONTS.inter,
          fontSize: 16,
          fontWeight: FONT_WEIGHTS.semibold,
          color: colors.textPrimary,
          marginBottom: 12,
        },
        scroll: {
          marginHorizontal: -SPACING.lg,
        },
        scrollContent: {
          paddingHorizontal: SPACING.lg,
          gap: 12,
        },
        cell: {
          width: CELL_WIDTH,
        },
        imageWrapper: {
          width: CELL_WIDTH,
          height: IMAGE_HEIGHT,
          borderRadius: 12,
          overflow: 'hidden',
          backgroundColor: colors.surfaceVariant,
        },
        image: {
          width: '100%',
          height: '100%',
        },
        question: {
          fontFamily: FONTS.inter,
          fontSize: 13,
          fontWeight: FONT_WEIGHTS.regular,
          color: colors.textPrimary,
          marginTop: 6,
          lineHeight: 17,
        },
      }),
    [colors]
  );

  if (rowItems.length === 0) return null;

  const handlePress = (item: RowItem) => {
    if (item.field === 'journal') {
      navigation.navigate('NotesEditor', { entryId: item.entryId });
    } else {
      navigation.navigate('EntryEdit', { entryId: item.entryId, focusField: item.field });
    }
  };

  return (
    <View>
      <AppText style={styles.sectionLabel}>Add more details</AppText>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
      >
        {rowItems.map((item) => (
          <TouchableOpacity
            key={item.entryId}
            style={styles.cell}
            onPress={() => handlePress(item)}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel={`${item.question} ${item.dateLabel}`}
          >
            <View style={styles.imageWrapper}>
              <Image
                source={{ uri: item.imageUri }}
                style={styles.image}
                resizeMode="cover"
                accessibilityIgnoresInvertColors
              />
            </View>
            <AppText style={styles.question} numberOfLines={2}>
              {item.question}
            </AppText>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
};

export default StudioAddMoreDetails;
