import React, { useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { FONT_WEIGHTS, SPACING } from '../../config/constants';
import { TEXT_STYLES } from '../../config/typography';
import { getCountryFlagEmoji } from '../../utils/countryUtils';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

// Day cell minHeight (52) + row marginBottom (4) — used to hit-test drag position -> day number,
// and exported so callers (e.g. the postcard Month Calendar template) can estimate this
// component's rendered height analytically without a measure-then-render pass.
const ROW_HEIGHT = 56;
export const CALENDAR_ROW_HEIGHT = ROW_HEIGHT;
/** Approx height of the month-name title line + its marginBottom. */
export const CALENDAR_TITLE_BLOCK_HEIGHT = 25;
/** Approx height of the Sun-Sat weekday-label row + its marginBottom. */
export const CALENDAR_WEEKDAY_ROW_HEIGHT = 17;
/** Hold duration before a press-and-drag starts a range selection (keeps normal scrolling unaffected). */
const RANGE_SELECT_LONG_PRESS_MS = 450;

export interface DashboardDayFlagCalendarProps {
  width: number;
  year: number;
  monthIndex0: number;
  /** Merged display: country name or null for unknown (render bullet). */
  displayByDay: Record<string, string | null>;
  textPrimary: string;
  textSecondary: string;
  textTertiary: string;
  /** Local day key for today; flag + day render inside a rounded pill when set. */
  todayDayKey?: string | null;
  todayPillBackground?: string;
  /** Day number color inside the today pill (for contrast on pill fill). */
  todayDayNumberColor?: string;
  /** When provided, day cells become tappable and invoke this with the cell's dayKey. */
  onDayPress?: (dayKey: string) => void;
  /** When provided, enables long-press-then-drag range selection across this month's days. */
  onRangeSelectionEnd?: (dayKeys: string[]) => void;
  /** Highlight fill for cells within an in-progress range selection. */
  rangeHighlightColor?: string;
  /** Optional text shadow applied to all title/weekday/day/flag text — for legibility when
   *  rendered directly over a photo instead of on a solid card background. */
  textShadow?: { color: string; offset: { width: number; height: number }; radius: number };
  /**
   * When set, crops the grid to a day-of-month range: weeks with no day in [minDay, maxDay]
   * are dropped entirely (not just hidden), and days within a kept week but outside the range
   * render as blank placeholder cells (keeping weekday-column alignment). Defaults to the full
   * month (1..last day) when omitted — existing callers are unaffected.
   */
  minDay?: number;
  maxDay?: number;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const rows: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    rows.push(arr.slice(i, i + size));
  }
  return rows;
}

const DashboardDayFlagCalendar: React.FC<DashboardDayFlagCalendarProps> = ({
  width,
  year,
  monthIndex0,
  displayByDay,
  textPrimary,
  textSecondary,
  textTertiary,
  todayDayKey,
  todayPillBackground,
  todayDayNumberColor,
  onDayPress,
  onRangeSelectionEnd,
  rangeHighlightColor,
  textShadow,
  minDay,
  maxDay,
}) => {
  const cellW = Math.floor((width - SPACING.xs * 2) / 7);
  const shadowStyle = textShadow
    ? {
        textShadowColor: textShadow.color,
        textShadowOffset: textShadow.offset,
        textShadowRadius: textShadow.radius,
      }
    : null;
  const title = useMemo(() => {
    const d = new Date(year, monthIndex0, 1);
    return d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  }, [year, monthIndex0]);

  const firstDow = useMemo(() => new Date(year, monthIndex0, 1).getDay(), [year, monthIndex0]);
  const lastDate = useMemo(() => new Date(year, monthIndex0 + 1, 0).getDate(), [year, monthIndex0]);

  const cropLo = minDay ?? 1;
  const cropHi = maxDay ?? lastDate;

  const rows = useMemo(() => {
    const cells: { key: string; day: number | null; dayKey: string | null }[] = [];
    for (let i = 0; i < firstDow; i++) {
      cells.push({ key: `pad-${i}`, day: null, dayKey: null });
    }
    for (let d = 1; d <= lastDate; d++) {
      const dayKey = `${year}-${monthIndex0}-${d}`;
      cells.push({ key: dayKey, day: d, dayKey });
    }
    const allRows = chunk(cells, 7);
    if (minDay == null && maxDay == null) return allRows;
    return allRows.filter((row) => row.some((cell) => cell.day != null && cell.day >= cropLo && cell.day <= cropHi));
  }, [year, monthIndex0, firstDow, lastDate, minDay, maxDay, cropLo, cropHi]);

  // Drag range-select state (visual highlight while dragging).
  const [rangeSelection, setRangeSelection] = useState<{ startDay: number; endDay: number } | null>(null);
  const rangeStartRef = useRef<number | null>(null);
  const rangeEndRef = useRef<number | null>(null);

  const dayFromPoint = (x: number, y: number): number => {
    const col = Math.min(6, Math.max(0, Math.floor(x / cellW)));
    const row = Math.max(0, Math.floor(y / ROW_HEIGHT));
    const flatIndex = row * 7 + col;
    const day = flatIndex - firstDow + 1;
    return Math.min(lastDate, Math.max(1, day));
  };

  const clearRange = () => {
    rangeStartRef.current = null;
    rangeEndRef.current = null;
    setRangeSelection(null);
  };

  // .runOnJS(true): callbacks execute on the JS thread (this app avoids Reanimated
  // worklets — see PostcardFramedPhotoSlot.tsx). activateAfterLongPress makes the
  // gesture require a genuine hold-then-drag, so ordinary scrolling/tapping is untouched.
  const rangeGesture = useMemo(() => {
    if (!onRangeSelectionEnd) return null;
    return Gesture.Pan()
      .runOnJS(true)
      .maxPointers(1)
      .activateAfterLongPress(RANGE_SELECT_LONG_PRESS_MS)
      .onStart((e) => {
        const day = dayFromPoint(e.x, e.y);
        rangeStartRef.current = day;
        rangeEndRef.current = day;
        setRangeSelection({ startDay: day, endDay: day });
      })
      .onUpdate((e) => {
        if (rangeStartRef.current == null) return;
        const day = dayFromPoint(e.x, e.y);
        rangeEndRef.current = day;
        setRangeSelection({ startDay: rangeStartRef.current, endDay: day });
      })
      .onEnd(() => {
        const start = rangeStartRef.current;
        const end = rangeEndRef.current;
        clearRange();
        if (start == null || end == null) return;
        const lo = Math.min(start, end);
        const hi = Math.max(start, end);
        const dayKeys: string[] = [];
        for (let d = lo; d <= hi; d++) dayKeys.push(`${year}-${monthIndex0}-${d}`);
        onRangeSelectionEnd(dayKeys);
      })
      .onFinalize(() => {
        clearRange();
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onRangeSelectionEnd, year, monthIndex0, cellW, firstDow, lastDate]);

  const rangeLo = rangeSelection ? Math.min(rangeSelection.startDay, rangeSelection.endDay) : null;
  const rangeHi = rangeSelection ? Math.max(rangeSelection.startDay, rangeSelection.endDay) : null;
  const highlightColor = rangeHighlightColor ?? `${textPrimary}22`;

  const gridBody = (
    <View>
      {rows.map((row, ri) => (
        <View key={`r-${ri}`} style={[styles.weekRow, { marginBottom: 4 }]}>
          {row.map((cell) => {
            const isCropped = cell.day != null && (cell.day < cropLo || cell.day > cropHi);
            if (cell.day == null || !cell.dayKey || isCropped) {
              return <View key={cell.key} style={{ width: cellW, height: 52 }} />;
            }
            const country = displayByDay[cell.dayKey];
            const symbol = country ? getCountryFlagEmoji(country) : '•';
            const isToday = Boolean(todayDayKey && cell.dayKey === todayDayKey);
            const pillBg = todayPillBackground ?? textSecondary;
            const isInRange = rangeLo != null && rangeHi != null && cell.day >= rangeLo && cell.day <= rangeHi;

            const flagEl = (
              <Text
                style={[styles.flag, { color: country ? textPrimary : textSecondary }, shadowStyle]}
                maxFontSizeMultiplier={1.35}
              >
                {symbol}
              </Text>
            );
            const dayEl = (
              <Text
                style={[
                  styles.dayNum,
                  { color: isToday ? (todayDayNumberColor ?? textPrimary) : textSecondary },
                  shadowStyle,
                ]}
                maxFontSizeMultiplier={1.2}
              >
                {cell.day}
              </Text>
            );

            const cellDayKey = cell.dayKey;
            const content = isToday ? (
              <View style={[styles.todayPill, { backgroundColor: pillBg }]}>
                {flagEl}
                {dayEl}
              </View>
            ) : (
              <>
                {flagEl}
                {dayEl}
              </>
            );

            const cellStyle = [
              styles.cell,
              { width: cellW },
              isInRange ? { backgroundColor: highlightColor, borderRadius: 8 } : null,
            ];

            if (onDayPress) {
              return (
                <Pressable
                  key={cell.key}
                  style={cellStyle}
                  onPress={() => onDayPress(cellDayKey)}
                  hitSlop={2}
                  accessibilityRole="button"
                  accessibilityLabel={`${title} ${cell.day}${country ? `, ${country}` : ', no country set'}`}
                >
                  {content}
                </Pressable>
              );
            }

            return (
              <View key={cell.key} style={cellStyle}>
                {content}
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );

  return (
    <View style={[styles.outer, { width }]}>
      <Text style={[styles.monthTitle, { color: textPrimary }, shadowStyle]} maxFontSizeMultiplier={1.35}>
        {title}
      </Text>
      <View style={[styles.weekRow, { marginBottom: SPACING.xs }]}>
        {WEEKDAYS.map((w) => (
          <View key={w} style={{ width: cellW, alignItems: 'center' }}>
            <Text style={[styles.weekLabel, { color: textTertiary }, shadowStyle]} maxFontSizeMultiplier={1.2}>
              {w}
            </Text>
          </View>
        ))}
      </View>
      {rangeGesture ? <GestureDetector gesture={rangeGesture}>{gridBody}</GestureDetector> : gridBody}
    </View>
  );
};

const styles = StyleSheet.create({
  outer: {
    alignSelf: 'center',
  },
  monthTitle: {
    ...TEXT_STYLES.entryInput,
    fontSize: 14,
    fontWeight: FONT_WEIGHTS.semibold,
    marginBottom: SPACING.sm,
    textAlign: 'center',
  },
  weekRow: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
  },
  weekLabel: {
    ...TEXT_STYLES.entryInput,
    fontSize: 10,
    fontWeight: FONT_WEIGHTS.semibold,
  },
  cell: {
    alignItems: 'center',
    justifyContent: 'flex-start',
    minHeight: 52,
  },
  todayPill: {
    alignItems: 'center',
    borderRadius: 8,
    paddingVertical: 5,
    paddingHorizontal: 6,
    alignSelf: 'center',
    minWidth: 36,
  },
  dayNum: {
    ...TEXT_STYLES.entryInput,
    fontSize: 10,
    marginTop: 2,
  },
  flag: {
    fontSize: 18,
    lineHeight: 22,
  },
});

export default DashboardDayFlagCalendar;
