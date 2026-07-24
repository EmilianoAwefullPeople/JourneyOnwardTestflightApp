// Country utilities
// Map country names (from geocoding) to flag emoji for Stats and lists

import { continentFromIso, type SevenContinent } from './isoContinent';

/**
 * Regional indicator A is U+1F1E6. Flag for ISO code "XY" is (0x1F1E6 - 10 + X), (0x1F1E6 - 10 + Y) in terms of letter position.
 * So "US" -> U is 20th letter (0-based 20), S is 18th -> 0x1F1FA, 0x1F1F8
 */
function isoToFlagEmoji(iso: string): string {
  if (iso.length !== 2) return '🌍';
  const a = iso.toUpperCase().charCodeAt(0) - 0x41 + 0x1f1e6;
  const b = iso.toUpperCase().charCodeAt(1) - 0x41 + 0x1f1e6;
  if (a < 0x1f1e6 || a > 0x1f1ff || b < 0x1f1e6 || b > 0x1f1ff) return '🌍';
  return String.fromCodePoint(a, b);
}

// Common country names as returned by geocoding (e.g. expo-location) -> ISO 3166-1 alpha-2
const COUNTRY_NAME_TO_ISO: Record<string, string> = {
  'United States': 'US',
  'United States of America': 'US',
  'Spain': 'ES',
  'France': 'FR',
  'Germany': 'DE',
  'Italy': 'IT',
  'United Kingdom': 'GB',
  'Portugal': 'PT',
  'Netherlands': 'NL',
  'Belgium': 'BE',
  'Mexico': 'MX',
  'Canada': 'CA',
  'Australia': 'AU',
  'Japan': 'JP',
  'China': 'CN',
  'India': 'IN',
  'Brazil': 'BR',
  'Argentina': 'AR',
  'Chile': 'CL',
  'Colombia': 'CO',
  'Peru': 'PE',
  'Indonesia': 'ID',
  'Thailand': 'TH',
  'Vietnam': 'VN',
  'South Korea': 'KR',
  'Korea, Republic of': 'KR',
  'New Zealand': 'NZ',
  'South Africa': 'ZA',
  'Egypt': 'EG',
  'Morocco': 'MA',
  'Turkey': 'TR',
  'Türkiye': 'TR',
  'Greece': 'GR',
  'Austria': 'AT',
  'Switzerland': 'CH',
  'Sweden': 'SE',
  'Norway': 'NO',
  'Denmark': 'DK',
  'Finland': 'FI',
  'Ireland': 'IE',
  'Poland': 'PL',
  'Czech Republic': 'CZ',
  'Czechia': 'CZ',
  'Hungary': 'HU',
  'Romania': 'RO',
  'Russia': 'RU',
  'Russian Federation': 'RU',
  'Ukraine': 'UA',
  'Israel': 'IL',
  'United Arab Emirates': 'AE',
  'Singapore': 'SG',
  'Malaysia': 'MY',
  'Philippines': 'PH',
  'Hong Kong': 'HK',
  'Taiwan': 'TW',
  'Costa Rica': 'CR',
  'Panama': 'PA',
  'Ecuador': 'EC',
  'Bolivia': 'BO',
  'Uruguay': 'UY',
  'Paraguay': 'PY',
  'Venezuela': 'VE',
  'Cuba': 'CU',
  'Dominican Republic': 'DO',
  'Jamaica': 'JM',
  'Puerto Rico': 'PR',
  'Iceland': 'IS',
  'Croatia': 'HR',
  'Serbia': 'RS',
  'Bulgaria': 'BG',
  'Slovenia': 'SI',
  'Slovakia': 'SK',
  'Lithuania': 'LT',
  'Latvia': 'LV',
  'Estonia': 'EE',
  'Kenya': 'KE',
  'Tanzania': 'TZ',
  'Tanzania, United Republic of': 'TZ',
  'Nigeria': 'NG',
  'Ghana': 'GH',
  'Senegal': 'SN',
  'Tunisia': 'TN',
  'Algeria': 'DZ',
  'Saudi Arabia': 'SA',
  'Qatar': 'QA',
  'Kuwait': 'KW',
  'Bahrain': 'BH',
  'Oman': 'OM',
  'Jordan': 'JO',
  'Lebanon': 'LB',
  'Pakistan': 'PK',
  'Bangladesh': 'BD',
  'Sri Lanka': 'LK',
  'Nepal': 'NP',
  'Cambodia': 'KH',
  'Myanmar': 'MM',
  'Laos': 'LA',
  "Lao People's Democratic Republic": 'LA',
  'Malta': 'MT',
  'Cyprus': 'CY',
  'Luxembourg': 'LU',
  'Monaco': 'MC',
  'Andorra': 'AD',
  'San Marino': 'SM',
  'Vatican City': 'VA',
  'Vatican': 'VA',
  'Macedonia': 'MK',
  'North Macedonia': 'MK',
  'Bosnia and Herzegovina': 'BA',
  'Montenegro': 'ME',
  'Albania': 'AL',
  'Georgia': 'GE',
  'Armenia': 'AM',
  'Azerbaijan': 'AZ',
  'Kazakhstan': 'KZ',
  'Uzbekistan': 'UZ',
  'Mongolia': 'MN',
  'Maldives': 'MV',
  'Brunei': 'BN',
  'Macau': 'MO',
  'Macao': 'MO',
};

/** All known country display names, sorted, for pickers/autocomplete. */
export const ALL_COUNTRY_NAMES: string[] = Object.keys(COUNTRY_NAME_TO_ISO).sort((a, b) => a.localeCompare(b));

function resolveIsoForCountryName(trimmed: string): string | undefined {
  const code = COUNTRY_NAME_TO_ISO[trimmed] ?? COUNTRY_NAME_TO_ISO[trimmed.replace(/\s+/g, ' ')];
  if (code) return code;
  const lower = trimmed.toLowerCase();
  const key = Object.keys(COUNTRY_NAME_TO_ISO).find((k) => k.toLowerCase() === lower);
  return key ? COUNTRY_NAME_TO_ISO[key] : undefined;
}

/**
 * Maps a reverse-geocoded country name (as stored on Entry.country) to its
 * ISO 3166-1 alpha-2 code, or undefined if unmapped. Used to match entries
 * against the world map's per-country paths.
 */
export function getIsoForCountryName(countryName: string): string | undefined {
  const trimmed = countryName?.trim();
  if (!trimmed) return undefined;
  return resolveIsoForCountryName(trimmed);
}

/**
 * Maps a reverse-geocoded country name to one of seven continents, or null if unknown / unmapped.
 */
export function getContinentForCountryName(countryName: string): SevenContinent | null {
  const trimmed = countryName.trim();
  if (!trimmed) return null;
  const iso = resolveIsoForCountryName(trimmed);
  if (!iso) return null;
  return continentFromIso(iso);
}

/**
 * Returns flag emoji for a country name (as returned by reverse geocoding).
 * Uses a static map of common names to ISO codes; fallback "🌍" for unknown.
 */
export function getCountryFlagEmoji(countryName: string): string {
  if (!countryName || typeof countryName !== 'string') return '🌍';
  const trimmed = countryName.trim();
  const code = COUNTRY_NAME_TO_ISO[trimmed] ?? COUNTRY_NAME_TO_ISO[trimmed.replace(/\s+/g, ' ')];
  if (code) return isoToFlagEmoji(code);
  return '🌍';
}
