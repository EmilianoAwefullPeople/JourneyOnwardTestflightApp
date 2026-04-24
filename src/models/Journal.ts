// Journal Model
// Represents reflection/journal entries tied to travel cycles

export interface Journal {
  id: string; // UUID
  title?: string;
  content: string;
  timestamp: string; // ISO date string
  cycleType: 'pre-trip' | 'morning' | 'end-day' | 'end-location' | 'end-trip';
  linkedEntryId?: string; // UUID reference to Entry (optional)
  emotionResponses?: string[]; // Survey answers (optional)
  aiPrompts?: string[]; // AI-generated prompts (optional)
  latitude?: number;
  longitude?: number;
  albumId?: string; // UUID reference to TripAlbum (optional)
  createdAt?: string; // ISO date string
  updatedAt?: string; // ISO date string
}
