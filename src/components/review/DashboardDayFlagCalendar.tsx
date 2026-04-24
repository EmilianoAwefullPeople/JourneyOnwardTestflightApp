import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { FONT_WEIGHTS, SPACING } from '../../config/constants';
import { TEXT_STYLES } from '../../config/typography';
import { getCountryFlagEmoji } from '../../utils/countryUtils';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

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
}) => {
  const cellW = Math.floor((width - SPACING.xs * 2) / 7);
  const title = useMemo(() => {
    const d = new Date(year, monthIndex0, 1);
    return d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  }, [year, monthIndex0]);

  const rows = useMemo(() => {
    const firstDow = new Date(year, monthIndex0, 1).getDay();
    const lastDate = new Date(year, monthIndex0 + 1, 0).getDate();
    const cells: { key: string; day: number | null; dayKey: string | null }[] = [];
    for (let i = 0; i < firstDow; i++) {
      cells.push({ key: `pad-${i}`, day: null, dayKey: null });
    }
    for (let d = 1; d <= lastDate; d++) {
      const dayKey = `${year}-${monthIndex0}-${d}`;
      cells.push({ key: dayKey, day: d, dayKey });
    }
    return chunk(cells, 7);
  }, [year, monthIndex0]);

  return (
    <View style={[styles.outer, { width }]}>
      <Text style={[styles.monthTitle, { color: textPrimary }]} maxFontSizeMultiplier={1.35}>
        {title}
      </Text>
      <View style={[styles.weekRow, { marginBottom: SPACING.xs }]}>
        {WEEKDAYS.map((w) => (
          <View key={w} style={{ width: cellW, alignItems: 'center' }}>
            <Text style={[styles.weekLabel, { color: textTertiary }]} maxFontSizeMultiplier={1.2}>
              {w}
            </Text>
          </View>
        ))}
      </View>
      {rows.map((row, ri) => (
        <View key={`r-${ri}`} style={[styles.weekRow, { marginBottom: 4 }]}>
          {row.map((cell) => {
            if (cell.day == null || !cell.dayKey) {
              return <View key={cell.key} style={{ width: cellW, height: 52 }} />;
            }
            const country = displayByDay[cell.dayKey];
            const symbol = country ? getCountryFlagEmoji(country) : '•';
            const isToday = Boolean(todayDayKey && cell.dayKey === todayDayKey);
            const pillBg = todayPillBackground ?? textSecondary;

            const flagEl = (
              <Text
                style={[styles.flag, { color: country ? textPrimary : textSecondary }]}
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
                ]}
                maxFontSizeMultiplier={1.2}
              >
                {cell.day}
              </Text>
            );

            return (
              <View key={cell.key} style={[styles.cell, { width: cellW }]}>
                {isToday ? (
                  <View style={[styles.todayPill, { backgroundColor: pillBg }]}>
                    {flagEl}
                    {dayEl}
                  </View>
                ) : (
                  <>
                    {flagEl}
                    {dayEl}
                  </>
                )}
              </View>
            );
          })}
        </View>
      ))}
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
