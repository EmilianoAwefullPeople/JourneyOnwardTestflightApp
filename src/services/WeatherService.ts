// WeatherService
// Fetches current weather at a location; used to auto-save with entries. Never blocks save on failure.

import { logger } from '../utils/logger';

const TIMEOUT_MS = 5000;

export type WeatherResult = {
  condition: string;
  temperatureCelsius: number;
};

/**
 * Map Open-Meteo WMO weather code to normalized condition string.
 * @see https://open-meteo.com/en/docs#api_form
 */
function weatherCodeToCondition(code: number): string {
  if (code === 0) return 'Sunny';
  if (code >= 1 && code <= 3) return 'Partly cloudy';
  if (code >= 45 && code <= 48) return 'Foggy';
  if (code >= 51 && code <= 67) return 'Rainy';
  if (code >= 71 && code <= 77) return 'Snowy';
  if (code >= 80 && code <= 82) return 'Rainy';
  if (code >= 85 && code <= 86) return 'Snowy';
  if (code >= 95 && code <= 99) return 'Rainy';
  return 'Unknown';
}

/**
 * Fetch current weather at latitude/longitude. Returns null on any failure (timeout, network, parse).
 * Does not throw; entry creation must never be blocked by weather.
 */
export async function getWeatherAtLocation(
  latitude: number,
  longitude: number
): Promise<WeatherResult | null> {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,weather_code`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);
    if (!res.ok) {
      logger.warn('WeatherService: non-OK response', res.status);
      return null;
    }
    const data = (await res.json()) as {
      current?: { temperature_2m?: number; weather_code?: number };
    };
    const current = data?.current;
    const temp = current?.temperature_2m;
    const code = current?.weather_code;
    if (typeof temp !== 'number' || Number.isNaN(temp)) {
      logger.warn('WeatherService: missing or invalid temperature');
      return null;
    }
    const condition = typeof code === 'number' ? weatherCodeToCondition(code) : 'Unknown';
    return { condition, temperatureCelsius: temp };
  } catch (error) {
    clearTimeout(timeoutId);
    if ((error as Error).name === 'AbortError') {
      logger.warn('WeatherService: request timeout');
    } else {
      logger.warn('WeatherService: fetch failed', error);
    }
    return null;
  }
}
