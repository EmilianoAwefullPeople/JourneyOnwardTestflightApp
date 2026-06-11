// Journal Model
// Represents reflection/journal entries

export interface Journal {
  id: string; // UUID
  title?: string;
  content: string;
  timestamp: string; // ISO date string
  linkedEntryId?: string; // UUID reference to Entry (optional)
  emotionResponses?: string[]; // Survey answers (optional)
  aiPrompts?: string[]; // AI-generated prompts (optional)
  latitude?: number;
  longitude?: number;
  country?: string;
  city?: string;
  albumId?: string; // UUID reference to TripAlbum (optional)
  createdAt?: string; // ISO date string
  updatedAt?: string; // ISO date string
}
