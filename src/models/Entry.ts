// Entry Model
// Represents captured experiences or insights

export interface Entry {
  id: string; // UUID
  type: 'experience' | 'insight';
  title?: string;
  description: string;
  mediaType: 'photo' | 'audio' | 'video';
  photoPaths: string[]; // Array of local file URIs (backward compatible)
  mediaPaths: string[]; // Array of local file URIs for all media types
  storageUrls: string[]; // Array of Supabase Storage URLs
  emotionLabels?: string[]; // Array of emotion labels (multi-select)
  emotionNote?: string; // Optional short text about how the user feels (emotion capture)
  timestamp: string; // ISO date string
  latitude?: number;
  longitude?: number;
  /** Human-readable country from reverse geocode (persisted; set once when coords are known). */
  country?: string;
  /** Human-readable city/locality from reverse geocode (persisted). */
  city?: string;
  albumId?: string; // UUID reference to TripAlbum
  journalId?: string; // UUID reference to Journal (optional)
  weather?: string; // Normalized condition e.g. Sunny Cloudy Rainy
  temperatureCelsius?: number;
  altitudeMeters?: number; // From device/Expo Location
  season?: 'spring' | 'summer' | 'autumn' | 'winter';
  isDraft: boolean;
  isAwe?: boolean; // User tagged this experience as full of awe
  /** Per-photo color palettes. colorPalettes[i] is 8 hex strings for photoPaths[i], most dominant first. */
  colorPalettes?: string[][];
  /** Per-photo thumbnail paths (400 px wide JPEG). thumbPaths[i] corresponds to photoPaths[i]. */
  thumbPaths?: string[];
  createdAt?: string; // ISO date string
  updatedAt?: string; // ISO date string
}
