import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SPACING } from '../../config/constants';
import type { ThemeColors } from '../../config/theme';
import { TEXT_STYLES } from '../../config/typography';
import type { Entry } from '../../models/Entry';
import EmotionalRadarChart, { type EmotionalRadarAxisDatum } from './EmotionalRadarChart';
import EmotionNotesCarousel, { type EmotionNoteExcerpt } from './EmotionNotesCarousel';

type EmotionAxisKey = 'tension' | 'happy' | 'amazed' | 'easy' | 'curious' | 'loving' | 'sad' | 'angry';

const AXIS_ORDER: Array<{ key: EmotionAxisKey; label: string }> = [
  { key: 'tension', label: 'Tension' },
  { key: 'happy', label: 'Happy' },
  { key: 'sad', label: 'Sad' },
  { key: 'easy', label: 'Easy' },
  { key: 'curious', label: 'Curious' },
  { key: 'loving', label: 'Loving' },
  { key: 'amazed', label: 'Amazed' },
  { key: 'angry', label: 'Angry' },
];

interface DashboardEmotionalDataSectionProps {
  entries: Entry[];
  colors: ThemeColors;
  width: number;
  isDark: boolean;
}

const MAX_NOTE_EXCERPT = 120;

function excerpt(text: string): string {
  const trimmed = text.trim().replace(/\s+/g, ' ');
  if (trimmed.length <= MAX_NOTE_EXCERPT) return trimmed;
  return `${trimmed.slice(0, MAX_NOTE_EXCERPT - 1).trimEnd()}...`;
}

function normalizeEmotionLabel(label: string): string {
  return label.trim().toLowerCase();
}

const DashboardEmotionalDataSection: React.FC<DashboardEmotionalDataSectionProps> = ({ entries, colors, width, isDark }) => {
  const aggregation = useMemo(() => {
    const withEmotionData = entries.filter((entry) => Array.isArray(entry.emotionLabels) && entry.emotionLabels.length > 0);
    const counts: Record<EmotionAxisKey, number> = {
      tension: 0,
      happy: 0,
      amazed: 0,
      easy: 0,
      curious: 0,
      loving: 0,
      sad: 0,
      angry: 0,
    };

    for (const entry of withEmotionData) {
      const labels = (entry.emotionLabels ?? []).map(normalizeEmotionLabel);
      for (const label of labels) {
        if (label === 'nervous' || label === 'stressed') counts.tension += 1;
        else if (label === 'happy') counts.happy += 1;
        else if (label === 'amazed') counts.amazed += 1;
        else if (label === 'easy') counts.easy += 1;
        else if (label === 'curious') counts.curious += 1;
        else if (label === 'loving') counts.loving += 1;
        else if (label === 'sad') counts.sad += 1;
        else if (label === 'angry') counts.angry += 1;
      }
    }

    const maxRaw = Math.max(0, ...Object.values(counts));
    const axes: EmotionalRadarAxisDatum[] = AXIS_ORDER.map((axis) => ({
      key: axis.key,
      label: axis.label,
      rawCount: counts[axis.key],
      value: maxRaw > 0 ? (counts[axis.key] / maxRaw) * 100 : 0,
    }));

    const notes: EmotionNoteExcerpt[] = entries
      .filter((entry) => typeof entry.emotionNote === 'string' && entry.emotionNote.trim().length > 0)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .map((entry) => ({
        id: entry.id,
        excerpt: excerpt(entry.emotionNote ?? ''),
        timestamp: entry.timestamp,
      }));

    return {
      subtitleCount: withEmotionData.length,
      axes,
      notes,
    };
  }, [entries]);

  const subtitle = `Data from ${aggregation.subtitleCount} ${aggregation.subtitleCount === 1 ? 'entry' : 'entries'}.`;
  const chartSummary = aggregation.axes.map((axis) => `${axis.label} ${axis.rawCount}`).join(', ');
  const chartAccent = isDark ? colors.babyBlue : colors.fern;

  return (
    <View>
      <Text style={[styles.subtitle, { color: colors.textSecondary }]}>{subtitle}</Text>
      {aggregation.subtitleCount === 0 ? (
        <Text style={[styles.placeholderText, { color: colors.textSecondary }]}>Capture emotion data to unlock this section.</Text>
      ) : (
        <View accessible accessibilityRole="summary" accessibilityLabel={`Emotional chart summary: ${chartSummary}`}>
          <EmotionalRadarChart
            width={width}
            height={268}
            axes={aggregation.axes}
            colors={{
              axis: colors.textTertiary,
              grid: colors.textTertiary,
              label: colors.textSecondary,
              polygonStroke: chartAccent,
              polygonFill: `${chartAccent}33`,
              point: chartAccent,
            }}
          />
        </View>
      )}

      {aggregation.notes.length > 0 ? (
        <View style={styles.notesWrap}>
          <Text style={[styles.notesSubtitle, { color: colors.textSecondary }]}>Your notes:</Text>
          <EmotionNotesCarousel notes={aggregation.notes} colors={colors} isDark={isDark} />
        </View>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  subtitle: {
    ...TEXT_STYLES.entryInput,
    fontSize: 13,
    marginBottom: SPACING.sm,
  },
  placeholderText: {
    ...TEXT_STYLES.entryInput,
    fontSize: 13,
  },
  notesWrap: {
    marginTop: SPACING.md,
  },
  notesSubtitle: {
    ...TEXT_STYLES.entryInput,
    fontSize: 13,
    fontStyle: 'italic',
    marginBottom: SPACING.xs,
  },
});

export default DashboardEmotionalDataSection;
