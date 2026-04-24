// TripAlbum Model
// Represents a trip/album grouping entries and journals

export interface TripAlbum {
  id: string; // UUID
  name: string;
  startDate: string; // ISO date string
  endDate?: string; // ISO date string (optional)
  locationName?: string;
  locationLat?: number;
  locationLng?: number;
  description?: string;
  plans?: string[]; // Array of planned activities
  intentions?: string[]; // Array of intentions
  travelReasons?: string[]; // Array of selected travel reason categories
  travelReasonText?: string; // Optional text about travel reason
  notes?: string; // Pre-trip intentions or notes
  entryIds?: string[]; // Array of entry UUIDs (computed from entries)
  // Review fields (for future)
  reviewStandoutThings?: string[];
  reviewStandoutReasons?: string[];
  reviewDeeperThoughts?: string;
  reviewDefiningWords?: string[];
  reviewCompletedAt?: string;
  createdAt?: string; // ISO date string
  updatedAt?: string; // ISO date string
}
