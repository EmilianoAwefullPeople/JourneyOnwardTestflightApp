// JournalSection
// Scrollable index-style log: MONTH YEAR (newest first) with Notion-style toggles; tap month to expand/collapse items

import React, { useMemo, useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  LayoutAnimation,
  Platform,
  UIManager,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Entry } from '../../models/Entry';
import { Journal } from '../../models/Journal';
import { SPACING, FONTS } from '../../config/constants';
import { getMainTabScrollContentPaddingBottom } from '../../navigation/mainTabBarMetrics';
import { TEXT_STYLES } from '../../config/typography';
import { useTheme } from '../../context/ThemeContext';
import { formatJournalListDate, getCityCountryLabel } from '../../utils/dateUtils';
import { Ionicons } from '@expo/vector-icons';

// Enable LayoutAnimation on Android (optional; no-op on iOS where it works by default)
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

export type JournalRowType = 'entry' | 'standalone_journal' | 'branch_journal';

export interface JournalRow {
  type: JournalRowType;
  entry?: Entry;
  journal?: Journal;
}

/** When 'date', section headers are full dates (e.g. "Wednesday, February 11, 2026"). Used in trip album view. */
export type JournalGroupBy = 'month' | 'date';

interface JournalSectionProps {
  entries: Entry[];
  journals: Journal[];
  onEntryPress: (entry: Entry) => void;
  onJournalPress: (journal: Journal) => void;
  /** Group sections by month (default) or by calendar date. */
  groupBy?: JournalGroupBy;
  /** Optional ref for scroll-to-top when Review tab is tapped */
  scrollRef?: React.RefObject<ScrollView | null>;
}

const LINE_WIDTH = 2;
const INDENT_TOP_LEVEL = 16;
const INDENT_BRANCH = 32;
const HORIZONTAL_SEGMENT = 12;
const MONTH_LINE_LEFT = 14;
const BRANCH_CONNECTOR_UP = 44;
const ROW_ICON_SIZE = 16;
const ROW_ICON_GAP = 8;
const PREVIEW_MAX_LEN = 80;

function truncateToSingleLine(s: string, maxLen: number = PREVIEW_MAX_LEN): string {
  try {
    if (s == null || typeof s !== 'string') return '';
    const oneLine = s.replace(/\s+/g, ' ').trim();
    if (oneLine.length <= maxLen) return oneLine;
    return oneLine.slice(0, maxLen).trim() + '…';
  } catch {
    return '';
  }
}

function getMonthKey(date: Date): string {
  const y = date.getFullYear();
  const m = date.getMonth() + 1;
  return `${y}-${m}`;
}

function parseMonthKey(key: string): { year: number; month: number } {
  const [year, month] = key.split('-').map(Number);
  return { year, month: month || 0 };
}

function getDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function isValidTimestamp(ts: string): boolean {
  try {
    const d = new Date(ts);
    return Number.isFinite(d.getTime());
  } catch {
    return false;
  }
}

const JournalSection: React.FC<JournalSectionProps> = ({
  entries: entriesProp,
  journals: journalsProp,
  onEntryPress,
  onJournalPress,
  groupBy = 'month',
  scrollRef,
}) => {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const entries = entriesProp ?? [];
  const journals = journalsProp ?? [];
  const [locationCache, setLocationCache] = useState<Record<string, string>>({});
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
  const hasSeededExpandRef = useRef(false);

  const toggleSection = (sectionKey: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(sectionKey)) next.delete(sectionKey);
      else next.add(sectionKey);
      return next;
    });
  };

  const expandOrCollapseAll = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    const keys = groupBy === 'date' ? dateKeys : monthKeys;
    const allExpanded = keys.length > 0 && expandedSections.size >= keys.length;
    setExpandedSections(allExpanded ? new Set() : new Set(keys));
  };

  const monthKeys = useMemo(() => {
    const set = new Set<string>();
    entries.forEach((e) => {
      if (isValidTimestamp(e.timestamp)) set.add(getMonthKey(new Date(e.timestamp)));
    });
    journals.forEach((j) => {
      if (isValidTimestamp(j.timestamp)) set.add(getMonthKey(new Date(j.timestamp)));
    });
    const keys = Array.from(set);
    keys.sort((a, b) => {
      const pa = parseMonthKey(a);
      const pb = parseMonthKey(b);
      if (pa.year !== pb.year) return pb.year - pa.year; // newest first
      return pb.month - pa.month;
    });
    return keys;
  }, [entries, journals]);

  const dateKeys = useMemo(() => {
    if (groupBy !== 'date') return [];
    const set = new Set<string>();
    entries.forEach((e) => {
      if (isValidTimestamp(e.timestamp)) set.add(getDateKey(new Date(e.timestamp)));
    });
    journals.forEach((j) => {
      if (isValidTimestamp(j.timestamp)) set.add(getDateKey(new Date(j.timestamp)));
    });
    const keys = Array.from(set);
    keys.sort((a, b) => b.localeCompare(a)); // newest first (YYYY-MM-DD)
    return keys;
  }, [entries, journals, groupBy]);

  const dataByMonth = useMemo(() => {
    const map = new Map<string, JournalRow[]>();
    const entryById = new Map(entries.map((e) => [e.id, e]));

    monthKeys.forEach((monthKey) => {
      const [year, monthNum] = monthKey.split('-').map(Number);
      const monthStart = new Date(year, monthNum - 1, 1).getTime();
      const monthEnd = new Date(year, monthNum, 0, 23, 59, 59, 999).getTime();

      const inMonth = (ts: string) => {
        const t = new Date(ts).getTime();
        return t >= monthStart && t <= monthEnd;
      };

      const entriesInMonth = entries.filter((e) => inMonth(e.timestamp));
      const journalsInMonth = journals.filter((j) => inMonth(j.timestamp));
      const entryIdsInMonth = new Set(entriesInMonth.map((e) => e.id));

      const topLevel: { type: 'entry' | 'journal'; entry?: Entry; journal?: Journal; ts: number }[] = [];
      entriesInMonth.forEach((e) => {
        topLevel.push({ type: 'entry', entry: e, ts: new Date(e.timestamp).getTime() });
      });
      journalsInMonth.forEach((j) => {
        const isBranch =
          j.linkedEntryId != null && entryIdsInMonth.has(j.linkedEntryId);
        if (!isBranch) {
          topLevel.push({ type: 'journal', journal: j, ts: new Date(j.timestamp).getTime() });
        }
      });
      topLevel.sort((a, b) => a.ts - b.ts);

      const rows: JournalRow[] = [];
      topLevel.forEach((item) => {
        if (item.type === 'entry' && item.entry) {
          rows.push({ type: 'entry', entry: item.entry });
          // Branch journals use the experience's month; include all journals linking to this entry regardless of journal timestamp
          const branches = journals
            .filter((j) => j.linkedEntryId === item.entry!.id)
            .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
          branches.forEach((j) => rows.push({ type: 'branch_journal', journal: j }));
        } else if (item.type === 'journal' && item.journal) {
          rows.push({ type: 'standalone_journal', journal: item.journal });
        }
      });
      map.set(monthKey, rows);
    });
    return map;
  }, [monthKeys, entries, journals]);

  const dataByDate = useMemo(() => {
    if (groupBy !== 'date') return new Map<string, JournalRow[]>();
    const map = new Map<string, JournalRow[]>();
    const entryById = new Map(entries.map((e) => [e.id, e]));

    dateKeys.forEach((dateKey) => {
      const [y, m, d] = dateKey.split('-').map(Number);
      const dayStart = new Date(y, m - 1, d, 0, 0, 0, 0).getTime();
      const dayEnd = new Date(y, m - 1, d, 23, 59, 59, 999).getTime();

      const inDay = (ts: string) => {
        const t = new Date(ts).getTime();
        return t >= dayStart && t <= dayEnd;
      };

      const entriesInDay = entries.filter((e) => inDay(e.timestamp));
      const journalsInDay = journals.filter((j) => inDay(j.timestamp));
      const entryIdsInDay = new Set(entriesInDay.map((e) => e.id));

      const topLevel: { type: 'entry' | 'journal'; entry?: Entry; journal?: Journal; ts: number }[] = [];
      entriesInDay.forEach((e) => {
        topLevel.push({ type: 'entry', entry: e, ts: new Date(e.timestamp).getTime() });
      });
      journalsInDay.forEach((j) => {
        const isBranch =
          j.linkedEntryId != null && entryIdsInDay.has(j.linkedEntryId);
        if (!isBranch) {
          topLevel.push({ type: 'journal', journal: j, ts: new Date(j.timestamp).getTime() });
        }
      });
      topLevel.sort((a, b) => a.ts - b.ts);

      const rows: JournalRow[] = [];
      topLevel.forEach((item) => {
        if (item.type === 'entry' && item.entry) {
          rows.push({ type: 'entry', entry: item.entry });
          const branches = journals
            .filter((j) => j.linkedEntryId === item.entry!.id)
            .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
          branches.forEach((j) => rows.push({ type: 'branch_journal', journal: j }));
        } else if (item.type === 'journal' && item.journal) {
          rows.push({ type: 'standalone_journal', journal: item.journal });
        }
      });
      map.set(dateKey, rows);
    });
    return map;
  }, [dateKeys, entries, journals, groupBy]);

  const sectionKeysForEffect = groupBy === 'date' ? dateKeys : monthKeys;
  useEffect(() => {
    if (hasSeededExpandRef.current) return;
    if (sectionKeysForEffect.length === 0) return;
    hasSeededExpandRef.current = true;
    setExpandedSections((prev) => {
      if (prev.size > 0) return prev;
      return new Set(sectionKeysForEffect.slice(0, 1));
    });
  }, [groupBy, sectionKeysForEffect]);

  useEffect(() => {
    let cancelled = false;
    const cache: Record<string, string> = {};
    const resolve = async () => {
      const toResolve: { key: string; lat: number; lng: number }[] = [];
      entries.forEach((e) => {
        const persistedLabel = [e.city?.trim(), e.country?.trim()].filter(Boolean).join(', ');
        if (persistedLabel) {
          cache[`entry-${e.id}`] = persistedLabel;
          return;
        }
        if (e.latitude != null && e.longitude != null) {
          toResolve.push({ key: `entry-${e.id}`, lat: e.latitude, lng: e.longitude });
        }
      });
      journals.forEach((j) => {
        if (j.latitude != null && j.longitude != null) {
          toResolve.push({ key: `journal-${j.id}`, lat: j.latitude, lng: j.longitude });
        }
      });
      for (const { key, lat, lng } of toResolve) {
        if (cancelled) return;
        try {
          const label = await getCityCountryLabel(lat, lng);
          cache[key] = label && label.trim() ? label : '';
        } catch {
          cache[key] = '';
        }
      }
      if (!cancelled) setLocationCache((prev) => ({ ...prev, ...cache }));
    };
    resolve();
    return () => {
      cancelled = true;
    };
  }, [entries, journals]);

  const getLocation = (row: JournalRow): string => {
    if (row.entry) {
      const key = `entry-${row.entry.id}`;
      if (locationCache[key]) return locationCache[key];
      return '';
    }
    if (row.journal) {
      const key = `journal-${row.journal.id}`;
      if (locationCache[key]) return locationCache[key];
      return '';
    }
    return '';
  };

  const getTitle = (row: JournalRow): string => {
    if (row.entry) return row.entry.title?.trim() || '(Untitled)';
    if (row.journal) return row.journal.title?.trim() || 'Journal Entry';
    return '';
  };

  const getSubtitle = (row: JournalRow): string => {
    try {
      const dateStr = row.entry
        ? formatJournalListDate(row.entry.timestamp)
        : row.journal
          ? formatJournalListDate(row.journal.timestamp)
          : '';
      const location = getLocation(row);
      if (!location) return dateStr ? `${dateStr}.` : '';
      return dateStr ? `${dateStr}. ${location}.` : `${location}.`;
    } catch {
      return '';
    }
  };

  const getPreview = (row: JournalRow): string => {
    try {
      if (row.entry) {
        const desc = row.entry.description?.trim();
        if (desc) return truncateToSingleLine(desc);
        const media = row.entry.mediaType;
        if (media === 'photo') return 'Photo';
        if (media === 'video') return 'Video';
        if (media === 'audio') return 'Audio';
        return '';
      }
      if (row.journal) {
        const content = row.journal.content?.trim();
        return content ? truncateToSingleLine(content) : '';
      }
      return '';
    } catch {
      return '';
    }
  };

  const getBranchParentTitle = (row: JournalRow): string | null => {
    try {
      if (row.type !== 'branch_journal' || !row.journal?.linkedEntryId) return null;
      const parent = entries.find((e) => e.id === row.journal!.linkedEntryId);
      if (!parent) return '—';
      return parent.title?.trim() || '(Untitled)';
    } catch {
      return null;
    }
  };

  const sectionKeys = groupBy === 'date' ? dateKeys : monthKeys;
  const getSectionRows = (key: string) =>
    groupBy === 'date' ? (dataByDate.get(key) ?? []) : (dataByMonth.get(key) ?? []);
  const getSectionHeaderLabel = (key: string): string => {
    if (groupBy === 'date') {
      const [y, m, d] = key.split('-').map(Number);
      return new Date(y, m - 1, d).toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
    }
    const { year, month } = parseMonthKey(key);
    return new Date(year, month - 1, 1).toLocaleDateString('en-US', {
      month: 'long',
      year: 'numeric',
    });
  };
  const isEmpty = sectionKeys.length === 0;

  const styles = useMemo(
    () =>
      StyleSheet.create({
        scrollView: { flex: 1 },
        content: {
          paddingHorizontal: SPACING.md,
          paddingTop: SPACING.sm,
          paddingBottom: getMainTabScrollContentPaddingBottom(insets.bottom, SPACING.xl),
        },
        emptyContainer: {
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
          padding: SPACING.xl,
        },
        emptyIconWrap: {
          marginBottom: SPACING.md,
        },
        emptyTitle: {
          ...TEXT_STYLES.entryInput,
          fontSize: 18,
          fontWeight: '600',
          color: colors.textPrimary,
          textAlign: 'center',
          marginBottom: SPACING.sm,
        },
        emptySubtext: {
          ...TEXT_STYLES.entryInput,
          fontSize: 15,
          color: colors.textSecondary,
          textAlign: 'center',
          paddingHorizontal: SPACING.lg,
        },
        expandCollapseAll: {
          alignSelf: 'flex-end',
          paddingVertical: SPACING.xs,
          paddingHorizontal: SPACING.sm,
          marginBottom: SPACING.sm,
        },
        expandCollapseAllText: {
          fontFamily: FONTS.inter,
          fontSize: 13,
          color: colors.textSecondary,
        },
        monthBlock: { marginBottom: SPACING.lg },
        monthHeaderRow: {
          flexDirection: 'row',
          alignItems: 'center',
          paddingVertical: SPACING.xs,
          marginBottom: SPACING.xs,
        },
        monthHeaderChevron: {
          fontFamily: FONTS.inter,
          fontSize: 17,
          color: colors.textSecondary,
          marginRight: SPACING.xs,
          width: 24,
        },
        monthHeader: {
          fontFamily: FONTS.inter,
          fontSize: 22,
          fontWeight: '600',
          color: colors.textPrimary,
          letterSpacing: 0.5,
          flex: 1,
        },
        row: {
          flexDirection: 'row',
          alignItems: 'flex-start',
          minHeight: 44,
          position: 'relative',
          paddingVertical: 4,
        },
        rowContent: {
          flexDirection: 'row',
          alignItems: 'flex-start',
          flex: 1,
        },
        rowIconWrap: { marginRight: ROW_ICON_GAP },
        rowTextBlock: { flex: 1 },
        rowTitle: {
          fontFamily: FONTS.inter,
          fontSize: 14,
          fontWeight: '700',
          color: colors.textPrimary,
        },
        rowTitleBranch: { color: colors.textSecondary },
        rowSubtitle: {
          fontFamily: FONTS.inter,
          fontSize: 12,
          fontStyle: 'italic',
          color: colors.textSecondary,
          marginTop: 2,
        },
        rowSubtitleBranch: { color: colors.textTertiary },
        rowPreview: {
          fontFamily: FONTS.inter,
          fontSize: 12,
          color: colors.textSecondary,
          marginTop: 2,
        },
        rowBranchLabel: {
          fontFamily: FONTS.inter,
          fontSize: 11,
          color: colors.textTertiary,
          fontStyle: 'italic',
          marginBottom: 2,
        },
        monthRowsWrapper: { position: 'relative' },
        monthVerticalLine: {
          position: 'absolute',
          top: 0,
          bottom: 0,
          backgroundColor: colors.border,
        },
        rowConnectorHorizontal: {
          position: 'absolute',
          backgroundColor: colors.border,
        },
        branchConnectorL: {
          position: 'absolute',
          borderColor: colors.border,
          borderBottomWidth: 0,
          borderRightWidth: 0,
        },
      }),
    [colors, insets.bottom]
  );

  if (isEmpty) {
    return (
      <View style={styles.emptyContainer} accessibilityLabel="No journal entries yet">
        <View style={styles.emptyIconWrap}>
          <Ionicons name="document-text-outline" size={56} color={colors.textSecondary} />
        </View>
        <Text style={styles.emptyTitle}>No journal entries yet</Text>
        <Text style={styles.emptySubtext}>
          Capture experiences and write from Home or from an experience to see them here.
        </Text>
      </View>
    );
  }

  const keys = sectionKeys;
  const allExpanded = keys.length > 0 && expandedSections.size >= keys.length;
  const showExpandCollapseAll = keys.length > 1;

  return (
    <ScrollView
      ref={scrollRef}
      style={styles.scrollView}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={true}
    >
      {showExpandCollapseAll ? (
        <TouchableOpacity
          style={styles.expandCollapseAll}
          onPress={expandOrCollapseAll}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={allExpanded ? 'Collapse all sections' : 'Expand all sections'}
        >
          <Text style={styles.expandCollapseAllText}>
            {allExpanded ? 'Collapse all' : 'Expand all'}
          </Text>
        </TouchableOpacity>
      ) : null}
      {sectionKeys.map((sectionKey) => {
        const sectionLabel = getSectionHeaderLabel(sectionKey);
        const displayLabel = groupBy === 'month' ? sectionLabel.toUpperCase() : sectionLabel;
        const rows = getSectionRows(sectionKey);
        const isExpanded = expandedSections.has(sectionKey);
        return (
          <View key={sectionKey} style={styles.monthBlock}>
            <TouchableOpacity
              style={styles.monthHeaderRow}
              onPress={() => toggleSection(sectionKey)}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={isExpanded ? `Collapse ${sectionLabel}` : `Expand ${sectionLabel}`}
              accessibilityState={{ expanded: isExpanded }}
            >
              <Text style={[styles.monthHeaderChevron]}>{isExpanded ? '▼' : '▶'}</Text>
              <Text style={styles.monthHeader}>{displayLabel}</Text>
            </TouchableOpacity>
            {isExpanded && (
            <View style={styles.monthRowsWrapper}>
              <View
                style={[
                  styles.monthVerticalLine,
                  {
                    left: MONTH_LINE_LEFT,
                    width: LINE_WIDTH,
                  },
                ]}
              />
              {rows.map((row, idx) => {
              const isBranch = row.type === 'branch_journal';
              const indent = isBranch ? INDENT_BRANCH : INDENT_TOP_LEVEL;
              const title = getTitle(row);
              const subtitle = getSubtitle(row);
              const preview = getPreview(row);
              const branchParentTitle = getBranchParentTitle(row);
              const iconColor = isBranch ? colors.textSecondary : colors.textPrimary;
              const onPress = () => {
                if (row.entry) onEntryPress(row.entry);
                else if (row.journal) onJournalPress(row.journal);
              };
              const rowKey =
                row.entry
                  ? `entry-${row.entry.id}`
                  : row.journal
                    ? `journal-${row.journal.id}-${idx}`
                    : `row-${sectionKey}-${idx}`;
              const accessibilityParts: string[] = [];
              if (row.entry) accessibilityParts.push('Experience', title);
              else if (isBranch && branchParentTitle) accessibilityParts.push('Journal note about ' + branchParentTitle, title);
              else accessibilityParts.push('Journal', title);
              if (preview) accessibilityParts.push(preview);
              if (subtitle) accessibilityParts.push(subtitle);
              const accessibilityLabel = accessibilityParts.filter(Boolean).join('. ');
              return (
                <TouchableOpacity
                  key={rowKey}
                  style={[styles.row, { paddingLeft: indent + HORIZONTAL_SEGMENT }]}
                  onPress={onPress}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel={accessibilityLabel}
                >
                  {isBranch ? (
                    <View
                      style={[
                        styles.branchConnectorL,
                        {
                          left: MONTH_LINE_LEFT,
                          top: -BRANCH_CONNECTOR_UP,
                          width: INDENT_BRANCH - MONTH_LINE_LEFT,
                          height: BRANCH_CONNECTOR_UP + 22,
                          borderLeftWidth: LINE_WIDTH,
                          borderTopWidth: LINE_WIDTH,
                        },
                      ]}
                    />
                  ) : (
                    <View
                      style={[
                        styles.rowConnectorHorizontal,
                        {
                          left: MONTH_LINE_LEFT,
                          width: (INDENT_TOP_LEVEL + HORIZONTAL_SEGMENT) - MONTH_LINE_LEFT,
                          height: LINE_WIDTH,
                          top: 26 - LINE_WIDTH / 2,
                        },
                      ]}
                    />
                  )}
                  <View style={styles.rowContent}>
                    {row.entry ? (
                      <View style={styles.rowIconWrap}>
                        <Ionicons
                          name="image-outline"
                          size={ROW_ICON_SIZE}
                          color={iconColor}
                        />
                      </View>
                    ) : row.journal ? (
                      <View style={styles.rowIconWrap}>
                        <Ionicons
                          name="document-text-outline"
                          size={ROW_ICON_SIZE}
                          color={iconColor}
                        />
                      </View>
                    ) : null}
                    <View style={styles.rowTextBlock}>
                      {isBranch && branchParentTitle != null ? (
                        <Text style={styles.rowBranchLabel} numberOfLines={1}>
                          About: {branchParentTitle}
                        </Text>
                      ) : null}
                      <Text
                        style={[
                          styles.rowTitle,
                          isBranch && styles.rowTitleBranch,
                        ]}
                        numberOfLines={1}
                      >
                        {title}
                      </Text>
                      {preview ? (
                        <Text
                          style={[styles.rowPreview, isBranch && { color: colors.textTertiary }]}
                          numberOfLines={1}
                        >
                          {preview}
                        </Text>
                      ) : null}
                      {subtitle ? (
                        <Text
                          style={[
                            styles.rowSubtitle,
                            isBranch && styles.rowSubtitleBranch,
                          ]}
                          numberOfLines={1}
                        >
                          {subtitle}
                        </Text>
                      ) : null}
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })}
            </View>
            )}
          </View>
        );
      })}
    </ScrollView>
  );
};

export default JournalSection;
