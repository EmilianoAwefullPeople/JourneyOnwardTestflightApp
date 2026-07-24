import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Image, TouchableOpacity, StyleSheet, LayoutChangeEvent } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AppText from '../../common/AppText';
import { PostcardFramedPhotoSlot } from '../PostcardFramedPhotoSlot';
import type { TemplateBaseProps } from './sharedTypes';
import DashboardDayFlagCalendar, {
  CALENDAR_ROW_HEIGHT,
  CALENDAR_TITLE_BLOCK_HEIGHT,
  CALENDAR_WEEKDAY_ROW_HEIGHT,
} from '../../review/DashboardDayFlagCalendar';
import { dayKeyFromTimestampIso, localDayKeyFromDate, localDayKeysInMonth } from '../../../utils/dayKeyUtils';
import { buildCaptureCountryByDayKey, buildMergedDayCountryDisplay } from '../../../utils/calendarDayCountryMap';
import { getDayCountrySnapshotsForDayKeys } from '../../../storage/dayCountrySnapshotStorage';
import {
  addDays,
  monthsTouchedByRange,
  parseDateOnlyIso,
  parseSelectedRange,
  type DateRange,
} from './monthCalendarUtils';
import type { YearMonth } from '../../../storage/calendarJoinMonthStorage';
import type { Entry } from '../../../models/Entry';

/** Calendar renders at up to this fraction of its natural size, scaled further down (never up)
 *  to fit whatever vertical space the chosen aspect ratio (1:1, 4:5, 9:16) leaves available. */
const CALENDAR_MAX_SCALE = 0.85;
/** Never shrink past this — beyond this point text stops being legible, so a very long range in
 *  a very short aspect ratio may render tight rather than unreadable. */
const CALENDAR_MIN_SCALE = 0.45;
const MONTH_BLOCK_GAP = 10;
const CALENDAR_VERTICAL_PADDING = 20;

interface MonthBlock {
  year: number;
  monthIndex0: number;
  displayByDay: Record<string, string | null>;
  minDay: number;
  maxDay: number;
  rowCount: number;
}

/** Mirrors DashboardDayFlagCalendar's own week-chunking so we can estimate its rendered height
 *  (and which weeks it'll drop) analytically, without a measure-then-render pass. */
function countCroppedRows(year: number, monthIndex0: number, minDay: number, maxDay: number): number {
  const firstDow = new Date(year, monthIndex0, 1).getDay();
  const lastDate = new Date(year, monthIndex0 + 1, 0).getDate();
  let rows = 0;
  for (let weekStart = 1 - firstDow; weekStart <= lastDate; weekStart += 7) {
    const weekEnd = weekStart + 6;
    const overlapLo = Math.max(weekStart, 1, minDay);
    const overlapHi = Math.min(weekEnd, lastDate, maxDay);
    if (overlapLo <= overlapHi) rows++;
  }
  return rows;
}

/**
 * One calendar block per calendar month the selected range touches (a 7-40 day range can span
 * 1-3 months). Day -> country uses the same two-layer precedence as the Dashboard calendar (see
 * FullCountryCalendarScreen.tsx): a logged Entry's persisted `country` wins, falling back to a
 * manually-set day snapshot (`dayCountrySnapshotStorage` — the "mark a day as a country"
 * feature). Only days that actually fall inside the selected range show a flag — days in the
 * same calendar month but outside the range render blank, since the month header is shown for
 * calendar context, not because every one of its days is part of the trip. Coordinate-based
 * reverse geocoding (the Dashboard's third layer) is intentionally not reproduced here — it
 * requires network lookups a postcard template shouldn't depend on.
 */
function useRangeMonthBlocks(entries: Entry[], range: DateRange): MonthBlock[] {
  const months = useMemo(() => monthsTouchedByRange(range), [range.start, range.end]);
  const startDate = useMemo(() => parseDateOnlyIso(range.start), [range.start]);
  const endDate = useMemo(() => parseDateOnlyIso(range.end), [range.end]);

  const rangeDayKeys = useMemo(() => {
    if (!startDate || !endDate) return [];
    const keys: string[] = [];
    for (let d = startDate; d <= endDate; d = addDays(d, 1)) {
      keys.push(localDayKeyFromDate(d));
    }
    return keys;
  }, [startDate, endDate]);
  const rangeKeySet = useMemo(() => new Set(rangeDayKeys), [rangeDayKeys]);

  const [snapshotByDay, setSnapshotByDay] = useState<Record<string, string>>({});
  useEffect(() => {
    let cancelled = false;
    getDayCountrySnapshotsForDayKeys(rangeDayKeys).then((snaps) => {
      if (!cancelled) setSnapshotByDay(snaps);
    });
    return () => {
      cancelled = true;
    };
  }, [rangeDayKeys]);

  const captureByDay = useMemo(() => buildCaptureCountryByDayKey(entries, [], {}), [entries]);

  return useMemo(
    () =>
      months.map(({ year, monthIndex0 }: YearMonth, index): MonthBlock => {
        const monthKeys = localDayKeysInMonth(year, monthIndex0);
        const merged = buildMergedDayCountryDisplay(monthKeys, captureByDay, snapshotByDay);
        const scoped: Record<string, string | null> = {};
        for (const key of monthKeys) {
          scoped[key] = rangeKeySet.has(key) ? merged[key] : null;
        }
        const lastDateOfMonth = new Date(year, monthIndex0 + 1, 0).getDate();
        const minDay = index === 0 && startDate ? startDate.getDate() : 1;
        const maxDay = index === months.length - 1 && endDate ? endDate.getDate() : lastDateOfMonth;
        return {
          year,
          monthIndex0,
          displayByDay: scoped,
          minDay,
          maxDay,
          rowCount: countCroppedRows(year, monthIndex0, minDay, maxDay),
        };
      }),
    [months, captureByDay, snapshotByDay, rangeKeySet, startDate, endDate]
  );
}

const CALENDAR_TEXT_SHADOW = {
  color: 'rgba(0,0,0,0.5)',
  offset: { width: 0, height: 1 },
  radius: 3,
};

const T07MonthCalendarTemplate = React.forwardRef<View, TemplateBaseProps>(
  (
    {
      slots,
      onSlotPress,
      onTransformChange,
      onResetSlotFraming,
      templateData,
      aspectRatio = 4 / 5,
      editingChromeSuppressed = false,
      previewMode = false,
      scale = 1,
      allEntries = [],
    },
    ref
  ) => {
    const clampedScale = Math.max(0.3, Math.min(1, scale));
    const s = (v: number) => Math.max(1, Math.round(v * clampedScale));
    const chromeSize = Math.max(12, Math.round(20 * clampedScale));
    const emptyIconSize = Math.max(14, Math.round(22 * clampedScale));

    const slot0 = slots[0] ?? {
      photoUri: null,
      transform: { scale: 1, translateX: 0, translateY: 0 },
      resetKey: 0,
      entry: null,
    };

    const range = useMemo(() => parseSelectedRange(templateData), [templateData]);
    const todayKey = useMemo(() => dayKeyFromTimestampIso(new Date().toISOString()), []);
    const monthBlocks = useRangeMonthBlocks(allEntries, range);

    const [calendarWidth, setCalendarWidth] = useState(0);
    const onCalendarLayout = useCallback((e: LayoutChangeEvent) => {
      const w = e.nativeEvent.layout.width;
      setCalendarWidth((prev) => (Math.abs(prev - w) > 0.5 ? w : prev));
    }, []);

    // Available vertical space is the whole postcard (calendarWrapper fills it), so the
    // calendar adapts to whichever aspect ratio (1:1, 4:5, 9:16) is currently selected.
    const [wrapperHeight, setWrapperHeight] = useState(0);
    const onWrapperLayout = useCallback((e: LayoutChangeEvent) => {
      const h = e.nativeEvent.layout.height;
      setWrapperHeight((prev) => (Math.abs(prev - h) > 0.5 ? h : prev));
    }, []);

    const dynamicScale = useMemo(() => {
      if (monthBlocks.length === 0 || wrapperHeight <= 0) return CALENDAR_MAX_SCALE;
      const naturalHeight =
        monthBlocks.reduce(
          (sum, block) =>
            sum + CALENDAR_TITLE_BLOCK_HEIGHT + CALENDAR_WEEKDAY_ROW_HEIGHT + block.rowCount * CALENDAR_ROW_HEIGHT,
          0
        ) +
        (monthBlocks.length - 1) * MONTH_BLOCK_GAP;
      const availableHeight = Math.max(0, wrapperHeight - CALENDAR_VERTICAL_PADDING * 2);
      if (naturalHeight <= 0) return CALENDAR_MAX_SCALE;
      const fitScale = availableHeight / naturalHeight;
      return Math.min(CALENDAR_MAX_SCALE, Math.max(CALENDAR_MIN_SCALE, fitScale));
    }, [monthBlocks, wrapperHeight]);

    return (
      <View ref={ref} collapsable={false} style={[st.container, { aspectRatio }]}>
        {slot0.photoUri ? (
          previewMode ? (
            <Image source={{ uri: slot0.photoUri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
          ) : (
            <View style={StyleSheet.absoluteFill}>
              <PostcardFramedPhotoSlot
                uri={slot0.photoUri}
                transform={slot0.transform}
                onTransformChange={(t) => onTransformChange?.(0, t)}
                resetKey={slot0.resetKey}
                interactionEnabled={!previewMode}
              />
            </View>
          )
        ) : (
          <TouchableOpacity
            style={st.emptySlot}
            onPress={() => !previewMode && onSlotPress?.(0)}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Add background photo"
          >
            <Ionicons name="image-outline" size={emptyIconSize} color="#555" />
            {!previewMode && <AppText style={{ color: '#555', fontSize: s(12) }}>Tap to add photo</AppText>}
          </TouchableOpacity>
        )}

        {/* Calendar — one block per month the range touches, cropped to the exact selected
            days, no card background; legibility comes from the text shadow only. Scaled to
            fit whichever aspect ratio (1:1, 4:5, 9:16) is currently selected. */}
        <View style={st.calendarWrapper} pointerEvents="none" onLayout={onWrapperLayout}>
          <View style={st.calendarMeasure} onLayout={onCalendarLayout}>
            {calendarWidth > 0 && (
              <View style={{ transform: [{ scale: dynamicScale }] }}>
                {monthBlocks.map((block) => (
                  <View key={`${block.year}-${block.monthIndex0}`} style={{ marginBottom: MONTH_BLOCK_GAP }}>
                    <DashboardDayFlagCalendar
                      width={calendarWidth}
                      year={block.year}
                      monthIndex0={block.monthIndex0}
                      displayByDay={block.displayByDay}
                      minDay={block.minDay}
                      maxDay={block.maxDay}
                      textPrimary="#FFFFFF"
                      textSecondary="rgba(255,255,255,0.8)"
                      textTertiary="rgba(255,255,255,0.6)"
                      todayDayKey={todayKey}
                      todayPillBackground="rgba(255,255,255,0.92)"
                      todayDayNumberColor="#1A1A1A"
                      textShadow={CALENDAR_TEXT_SHADOW}
                    />
                  </View>
                ))}
              </View>
            )}
          </View>
        </View>

        {/* Photo edit chrome */}
        {slot0.photoUri && !previewMode && !editingChromeSuppressed && (
          <View style={st.editChrome} pointerEvents="box-none">
            <TouchableOpacity
              style={st.chromeBtn}
              onPress={() => onResetSlotFraming?.(0)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel="Reset photo framing"
            >
              <Ionicons name="refresh-outline" size={chromeSize} color="rgba(255,255,255,0.92)" />
            </TouchableOpacity>
            <TouchableOpacity
              style={st.chromeBtn}
              onPress={() => onSlotPress?.(0)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel="Change photo"
            >
              <Ionicons name="images-outline" size={chromeSize} color="rgba(255,255,255,0.92)" />
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  }
);

T07MonthCalendarTemplate.displayName = 'T07MonthCalendarTemplate';

export default T07MonthCalendarTemplate;

const st = StyleSheet.create({
  container: {
    backgroundColor: '#000',
    overflow: 'hidden',
    position: 'relative',
  },
  emptySlot: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#1a1a1a',
  },
  calendarWrapper: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: CALENDAR_VERTICAL_PADDING,
  },
  calendarMeasure: {
    width: '100%',
  },
  editChrome: {
    position: 'absolute',
    top: 12,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    zIndex: 10,
  },
  chromeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
