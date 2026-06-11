// Date Utils
// Utility functions for formatting dates and locations

import { Entry } from '../models/Entry';
import { logger } from './logger';

/** Geocoded address with optional fields that expo-location may return but does not declare in its type */
interface GeocodedAddressWithLocality {
  city?: string;
  region?: string;
  country?: string;
  district?: string;
  subAdministrativeArea?: string;
  locality?: string;
}

/**
 * Format entry date from timestamp
 * Format: "Month Day, Year."
 * Example: "November 9, 2025."
 */
export const formatEntryDate = (timestamp: string): string => {
  try {
    const date = new Date(timestamp);
    const month = date.toLocaleDateString('en-US', { month: 'long' });
    const day = date.getDate();
    const year = date.getFullYear();
    return `${month} ${day}, ${year}.`;
  } catch (error) {
    logger.error('Error formatting date:', error);
    return '';
  }
};

/**
 * Format timestamp for Journal section header when grouped by date (trip album view).
 * Format: "Weekday, Month Day, Year"
 * Example: "Wednesday, February 11, 2026"
 */
export const formatJournalSectionDateHeader = (timestamp: string): string => {
  try {
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  } catch (error) {
    logger.error('Error formatting journal section date header:', error);
    return '';
  }
};

/**
 * Format timestamp for Journal index list (numeric)
 * Format: "D/M/YYYY"
 * Example: "28/1/2026"
 */
export const formatJournalListDate = (timestamp: string): string => {
  try {
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) return '';
    const day = date.getDate();
    const month = date.getMonth() + 1;
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
  } catch (error) {
    logger.error('Error formatting journal list date:', error);
    return '';
  }
};

/**
 * Reverse geocode coordinates to get location name
 * Returns location name like "Chamartin, Madrid" or null if geocoding fails
 */
export const reverseGeocode = async (latitude: number, longitude: number): Promise<string | null> => {
  try {
    const locationModule = await import('expo-location');
    
    // Use reverseGeocodeAsync to get address from coordinates
    const addresses = await locationModule.reverseGeocodeAsync({
      latitude,
      longitude,
    });
    
    if (addresses && addresses.length > 0) {
      const address = addresses[0] as GeocodedAddressWithLocality;
      // Format: "District, City" or "City, Country" depending on available data
      const parts: string[] = [];
      
      // Try to get district/neighborhood first
      if (address.district || address.subAdministrativeArea) {
        parts.push(address.district || address.subAdministrativeArea || '');
      }
      
      // Then city
      if (address.city || address.locality) {
        parts.push(address.city || address.locality || '');
      }
      
      // If no district, use region/state
      if (parts.length === 0 && address.region) {
        parts.push(address.region);
      }
      
      // If still nothing, use country
      if (parts.length === 0 && address.country) {
        parts.push(address.country);
      }
      
      // Filter out empty parts and join
      const locationName = parts.filter(p => p && p.trim().length > 0).join(', ');
      
      return locationName || null;
    }
    
    return null;
  } catch (error) {
    logger.error('Error reverse geocoding:', error);
    return null;
  }
};

export type ExpoLocationModule = typeof import('expo-location');

/**
 * Get country name from coordinates (for stats/counts).
 * Returns country string or null if geocoding fails.
 * Pass `locationModule` when batching to avoid repeated dynamic imports.
 */
export const getCountryFromCoordinates = async (
  latitude: number,
  longitude: number,
  options?: { locationModule?: ExpoLocationModule }
): Promise<string | null> => {
  try {
    const locationModule = options?.locationModule ?? (await import('expo-location'));
    const addresses = await locationModule.reverseGeocodeAsync({ latitude, longitude });
    if (addresses && addresses.length > 0 && addresses[0].country) {
      return addresses[0].country;
    }
    return null;
  } catch (error) {
    logger.error('Error getting country from coordinates:', error);
    return null;
  }
};

/**
 * Get city and country label from coordinates
 * Returns "City, Country" format (e.g. "Madrid, Spain") or null on failure
 */
export const getCityCountryLabel = async (latitude: number, longitude: number): Promise<string | null> => {
  try {
    const locationModule = await import('expo-location');
    const addresses = await locationModule.reverseGeocodeAsync({ latitude, longitude });

    if (addresses && addresses.length > 0) {
      const address = addresses[0] as GeocodedAddressWithLocality;
      const city = address.city || address.locality || address.subAdministrativeArea || '';
      const country = address.country || '';

      const parts = [city, country].filter(p => p && p.trim().length > 0);
      return parts.length > 0 ? parts.join(', ') : null;
    }

    return null;
  } catch (error) {
    logger.error('Error getting city/country label:', error);
    return null;
  }
};

/**
 * Format location from entry
 * Uses reverse geocoding to get location name, falls back to coordinates if geocoding fails
 */
export const formatLocation = async (entry: Entry): Promise<string> => {
  if (entry.latitude === undefined || entry.longitude === undefined) {
    return 'Location unavailable';
  }

  // Try reverse geocoding first – always prefer human-readable names
  const locationName = await reverseGeocode(entry.latitude, entry.longitude);
  if (locationName && locationName.trim().length > 0) {
    return locationName;
  }

  // Fallback: avoid exposing raw coordinates in user-facing labels on Home;
  // if we cannot resolve a name, signal unavailability instead of lat/lng noise.
  return 'Location unavailable';
};

/**
 * Format location and date together (async version)
 * Format: "Location Name. Month Day, Year."
 * Example: "Nazaré, Portugal. November 9, 2025."
 */
export const formatLocationAndDate = async (entry: Entry): Promise<string> => {
  const location = await formatLocation(entry);
  const date = formatEntryDate(entry.timestamp);
  
  if (!location || location === 'Location unavailable') {
    return date || '';
  }
  
  if (!date) {
    return location;
  }
  
  // Format: "Location. Date"
  return `${location}. ${date}`;
};

/**
 * Format temperature for display. Stores in Celsius; can display in F.
 * Example: "22°C" or "72°F"
 */
export function formatTemperature(celsius: number, unit: 'C' | 'F' = 'C'): string {
  if (unit === 'F') {
    const f = (celsius * 9) / 5 + 32;
    return `${Math.round(f)}°F`;
  }
  return `${Math.round(celsius)}°C`;
}

/**
 * Format time of day from ISO timestamp (e.g. for "Sunset" / time cell in entry detail).
 * Example: "6:42 PM"
 */
export function formatTimeOfDay(timestamp: string): string {
  try {
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  } catch (error) {
    logger.error('Error formatting time of day:', error);
    return '';
  }
}

/**
 * Time-based greeting for other screens (hour only, no location/sunset).
 * Midnight–5AM: Good Night | 5AM–noon: Good Morning | noon–5PM: Good Afternoon | 5PM–midnight: Good Evening
 */
export function getTimeBasedGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 5) return 'Good Night';
  if (hour < 12) return 'Good Morning';
  if (hour < 17) return 'Good Afternoon';
  return 'Good Evening';
}
