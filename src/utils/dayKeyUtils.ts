/** Local calendar day key aligned with dashboard bucketing (Y-M-D using local getters). */

export function localDayKeyFromDate(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

export function dayKeyFromTimestampIso(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return localDayKeyFromDate(d);
}

/** All local `dayKey` strings for dates 1..lastDay in the given month (month is 0-based). */
export function localDayKeysInMonth(year: number, monthIndex0: number): string[] {
  const lastDay = new Date(year, monthIndex0 + 1, 0).getDate();
  const keys: string[] = [];
  for (let day = 1; day <= lastDay; day++) {
    keys.push(`${year}-${monthIndex0}-${day}`);
  }
  return keys;
}
