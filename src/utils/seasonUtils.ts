// Season Utils
// Derive season from timestamp and optional latitude (hemisphere)

export type Season = 'spring' | 'summer' | 'autumn' | 'winter';

/**
 * Get season from timestamp. Uses latitude for hemisphere (Northern by default).
 * Northern: 3-5 spring, 6-8 summer, 9-11 autumn, 12-2 winter.
 * Southern: opposite (e.g. month 6 = winter).
 */
export function getSeasonFromTimestamp(
  timestamp: string,
  latitude?: number
): Season | undefined {
  try {
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) return undefined;
    const month = date.getMonth() + 1; // 1-12
    const isSouthern = latitude != null && latitude < 0;

    // Northern hemisphere: 3-5 spring, 6-8 summer, 9-11 autumn, 12,1,2 winter
    const northernSeason = (m: number): Season => {
      if (m >= 3 && m <= 5) return 'spring';
      if (m >= 6 && m <= 8) return 'summer';
      if (m >= 9 && m <= 11) return 'autumn';
      return 'winter';
    };
    const southernSeason = (m: number): Season => {
      if (m >= 3 && m <= 5) return 'autumn';
      if (m >= 6 && m <= 8) return 'winter';
      if (m >= 9 && m <= 11) return 'spring';
      return 'summer';
    };

    return isSouthern ? southernSeason(month) : northernSeason(month);
  } catch {
    return undefined;
  }
}
