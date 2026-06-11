import { TripAlbum } from './TripAlbum';

export interface RecapCandidate {
  id: string;
  album: TripAlbum;
  displayName: string;
  dateRange: string;
  entryIds: string[];
  previewImageUris: string[];
}

export interface PostcardItem {
  photoUri: string;
  location?: string;
}

export type RecapSlideType =
  | 'opening_screen'
  | 'title_card'
  | 'opening_stats'
  | 'beginning_of_trip_photos'
  | 'activity_multiple_choice'
  | 'activity_distribution_graph'
  | 'color_palette'
  | 'color_palette_photo'
  | 'emotion_data'
  | 'journal_data'
  | 'location_data'
  | 'graphic_location_data'
  | 'middle_of_trip_photos'
  | 'weather_data'
  | 'temperature_data'
  | 'altitude_data'
  | 'end_of_trip_photos';

export interface OpeningScreenPayload {
  postcards: PostcardItem[];
}

export interface TitleCardPayload {
  tripName: string;
  dateRange: string;
  backgroundPhotoUri?: string;
}

export interface OpeningStatsPayload {
  tripDays: number;
  memoriesCount: number;
  photosCount: number;
  journalCount: number;
}

export interface BeginningPhotosPayload {
  bgPhotoUri: string;
  postcards: PostcardItem[];
}

export interface ActivityMultipleChoicePayload {
  peakDay: string;
  choices: string[];
}

export interface ActivityDistributionPayload {
  data: Array<{ date: string; count: number }>;
  xAxisMode: 'days' | 'weeks';
}

export interface ColorPalettePayload {
  colors: string[];
  tripLabel: string;
}

export interface ColorPalettePhotoPayload {
  colors: string[];
  photoUri: string;
}

export interface EmotionDataPayload {
  emotions: Array<{ label: string; count: number }>;
}

export interface JournalDataPayload {
  words: number;
  sentences: number;
  chapters: number;
}

export interface LocationDataPayload {
  totalPlaces: number;
  topPlaces: Array<{ name: string; count: number }>;
}

export interface GraphicLocationDataPayload {
  locations: Array<{ latitude: number; longitude: number; label: string }>;
  cityList: string[];
  postcard: PostcardItem;
}

export interface MiddlePhotosPayload {
  photoUris: string[];
}

export interface WeatherDataPayload {
  conditions: Array<{ condition: string; percentage: number }>;
  photoUri: string;
}

export interface TemperatureDataPayload {
  averageCelsius: number;
  lowestCelsius: number;
  highestCelsius: number;
  photoUri: string;
}

export interface AltitudeDataPayload {
  lowest: { altitudeMeters: number; photoUri: string };
  highest: { altitudeMeters: number; photoUri: string };
}

export interface EndPhotosPayload {
  postcards: PostcardItem[];
}

export type RecapSlidePayload =
  | OpeningScreenPayload
  | TitleCardPayload
  | OpeningStatsPayload
  | BeginningPhotosPayload
  | ActivityMultipleChoicePayload
  | ActivityDistributionPayload
  | ColorPalettePayload
  | ColorPalettePhotoPayload
  | EmotionDataPayload
  | JournalDataPayload
  | LocationDataPayload
  | GraphicLocationDataPayload
  | MiddlePhotosPayload
  | WeatherDataPayload
  | TemperatureDataPayload
  | AltitudeDataPayload
  | EndPhotosPayload;

export interface RecapSlide {
  id: string;
  type: RecapSlideType;
  durationMs: number;
  interactive?: boolean;
  payload: RecapSlidePayload;
}
