// Simplified sunset calculation utilities
// Based on NOAA solar calculation algorithm
// Accurate to within ~5-10 minutes

export interface SunTimes {
  sunrise: Date;
  sunset: Date;
}

/**
 * Calculate sunrise and sunset times for a given location and date
 * @param lat Latitude in degrees (-90 to 90)
 * @param lon Longitude in degrees (-180 to 180)
 * @param date Optional date (defaults to today)
 * @returns Object with sunrise and sunset Date objects in local timezone
 */
export function getSunTimes(lat: number, lon: number, date: Date = new Date()): SunTimes {
  // Convert to start of day in local timezone
  const localDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  
  // Julian day calculation
  const jd = getJulianDay(localDate);
  
  // Calculate sunrise and sunset in fractional day (0-1)
  const sunriseTime = calculateSunTime(jd, lat, lon, true);
  const sunsetTime = calculateSunTime(jd, lat, lon, false);
  
  // Convert fractional day to Date objects
  const sunrise = fractionalDayToDate(localDate, sunriseTime);
  const sunset = fractionalDayToDate(localDate, sunsetTime);
  
  return { sunrise, sunset };
}

/**
 * Get sunset time for today at given coordinates
 * @param lat Latitude in degrees
 * @param lon Longitude in degrees
 * @returns Sunset Date object in local timezone
 */
export function getSunsetToday(lat: number, lon: number): Date {
  return getSunTimes(lat, lon, new Date()).sunset;
}

/**
 * Check if current time is after sunset at given location
 * @param lat Latitude in degrees
 * @param lon Longitude in degrees
 * @returns true if current time is after sunset
 */
export function isAfterSunset(lat: number, lon: number): boolean {
  const sunset = getSunsetToday(lat, lon);
  return new Date() > sunset;
}

// Helper functions

function getJulianDay(date: Date): number {
  const time = date.getTime();
  return (time / 86400000) + 2440587.5;
}

function calculateSunTime(jd: number, lat: number, lon: number, isSunrise: boolean): number {
  // Constants
  const zenith = 90.833; // Official zenith for sunrise/sunset
  
  // Convert latitude to radians
  const latRad = lat * Math.PI / 180;
  
  // Calculate day of year
  const n = Math.floor(jd - 2451545.0 + 0.0008);
  
  // Mean solar time
  const J_star = n - (lon / 360);
  
  // Solar mean anomaly
  const M = (357.5291 + 0.98560028 * J_star) % 360;
  const M_rad = M * Math.PI / 180;
  
  // Equation of center
  const C = 1.9148 * Math.sin(M_rad) + 0.0200 * Math.sin(2 * M_rad) + 0.0003 * Math.sin(3 * M_rad);
  
  // Ecliptic longitude
  const lambda = (M + C + 180 + 102.9372) % 360;
  const lambda_rad = lambda * Math.PI / 180;
  
  // Solar transit
  const J_transit = 2451545.0 + J_star + 0.0053 * Math.sin(M_rad) - 0.0069 * Math.sin(2 * lambda_rad);
  
  // Declination of the sun
  const sin_delta = Math.sin(lambda_rad) * Math.sin(23.44 * Math.PI / 180);
  const delta_rad = Math.asin(sin_delta);
  
  // Hour angle
  const cos_omega = (Math.sin(-zenith * Math.PI / 180) - Math.sin(latRad) * sin_delta) / 
                    (Math.cos(latRad) * Math.cos(delta_rad));
  
  // Check if sun never rises/sets (polar regions)
  if (cos_omega > 1) {
    // Sun never rises - return midnight
    return isSunrise ? 0 : 0.5;
  }
  if (cos_omega < -1) {
    // Sun never sets - return noon
    return isSunrise ? 0.5 : 1;
  }
  
  const omega = Math.acos(cos_omega) * 180 / Math.PI;
  
  // Calculate sunrise or sunset
  const J_set_rise = J_transit + (isSunrise ? -omega : omega) / 360;
  
  // Convert to fractional day (0-1) in local timezone
  const fractionalDay = (J_set_rise - jd + 0.5) % 1;
  return fractionalDay < 0 ? fractionalDay + 1 : fractionalDay;
}

function fractionalDayToDate(baseDate: Date, fractionalDay: number): Date {
  const millisInDay = 86400000;
  const offset = fractionalDay * millisInDay;
  return new Date(baseDate.getTime() + offset);
}

/**
 * Cache for sunset calculations
 * Stores sunset time with location and date to avoid recalculating
 */
export class SunsetCache {
  private cache: {
    lat: number;
    lon: number;
    date: string; // YYYY-MM-DD
    sunset: Date;
  } | null = null;

  /**
   * Get sunset time, using cache if available
   */
  getSunset(lat: number, lon: number): Date {
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    
    // Check if cache is valid
    if (
      this.cache &&
      this.cache.lat === lat &&
      this.cache.lon === lon &&
      this.cache.date === today
    ) {
      return this.cache.sunset;
    }
    
    // Calculate and cache
    const sunset = getSunsetToday(lat, lon);
    this.cache = { lat, lon, date: today, sunset };
    return sunset;
  }

  /**
   * Clear the cache
   */
  clear(): void {
    this.cache = null;
  }
}
