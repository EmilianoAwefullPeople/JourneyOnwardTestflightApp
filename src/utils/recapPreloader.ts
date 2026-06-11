import { Image as ExpoImage } from 'expo-image';
import type {
  RecapSlide,
  PostcardItem,
  OpeningScreenPayload,
  TitleCardPayload,
  BeginningPhotosPayload,
  ColorPalettePhotoPayload,
  GraphicLocationDataPayload,
  MiddlePhotosPayload,
  WeatherDataPayload,
  TemperatureDataPayload,
  AltitudeDataPayload,
  EndPhotosPayload,
} from '../models/Recap';

// ─── Map region ──────────────────────────────────────────────────────────────

export interface MapRegion {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
}

export interface MapLocationPin {
  latitude: number;
  longitude: number;
  label: string;
}

// Shared so both the preloader and GraphicLocationDataSlide compute the same region.
export function computeMapRegion(locs: MapLocationPin[]): MapRegion {
  if (locs.length === 0) {
    return { latitude: 20, longitude: 0, latitudeDelta: 60, longitudeDelta: 60 };
  }
  if (locs.length === 1) {
    return { latitude: locs[0].latitude, longitude: locs[0].longitude, latitudeDelta: 0.5, longitudeDelta: 0.5 };
  }
  const lats = locs.map((l) => l.latitude);
  const lngs = locs.map((l) => l.longitude);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const latPad = Math.max((maxLat - minLat) * 0.3, 0.3);
  const lngPad = Math.max((maxLng - minLng) * 0.3, 0.3);
  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLng + maxLng) / 2,
    latitudeDelta: maxLat - minLat + latPad,
    longitudeDelta: maxLng - minLng + lngPad,
  };
}

// ─── Preload assets ───────────────────────────────────────────────────────────

export interface PreloadAssets {
  imageUris: string[];
  postcardItems: PostcardItem[];
  needsMap: boolean;
  mapProps?: { region: MapRegion; locations: MapLocationPin[] };
}

// Module-level cache — GraphicLocationDataSlide and OffScreenMap both read this
let mapModuleCache: typeof import('react-native-maps') | null = null;

export function getCachedMapModule() {
  return mapModuleCache;
}

export async function preloadMap(): Promise<void> {
  if (mapModuleCache) return;
  try {
    mapModuleCache = await import('react-native-maps');
  } catch {
    // non-fatal — slide falls back to its own import
  }
}

export function collectPreloadAssets(slides: RecapSlide[]): PreloadAssets {
  const imageUriSet = new Set<string>();
  const postcardMap = new Map<string, PostcardItem>();
  let needsMap = false;
  let mapProps: PreloadAssets['mapProps'];

  for (const slide of slides) {
    switch (slide.type) {
      case 'opening_screen': {
        const p = slide.payload as OpeningScreenPayload;
        p.postcards.forEach((pc) => postcardMap.set(pc.photoUri, pc));
        break;
      }
      case 'title_card': {
        const p = slide.payload as TitleCardPayload;
        if (p.backgroundPhotoUri) imageUriSet.add(p.backgroundPhotoUri);
        break;
      }
      case 'beginning_of_trip_photos': {
        const p = slide.payload as BeginningPhotosPayload;
        if (p.bgPhotoUri) imageUriSet.add(p.bgPhotoUri);
        p.postcards.forEach((pc) => postcardMap.set(pc.photoUri, pc));
        break;
      }
      case 'color_palette_photo': {
        const p = slide.payload as ColorPalettePhotoPayload;
        if (p.photoUri) imageUriSet.add(p.photoUri);
        break;
      }
      case 'graphic_location_data': {
        needsMap = true;
        const p = slide.payload as GraphicLocationDataPayload;
        postcardMap.set(p.postcard.photoUri, p.postcard);
        // Compute region now so the off-screen MapView renders the right area
        mapProps = { region: computeMapRegion(p.locations), locations: p.locations };
        break;
      }
      case 'middle_of_trip_photos': {
        const p = slide.payload as MiddlePhotosPayload;
        p.photoUris.forEach((u) => { if (u) imageUriSet.add(u); });
        break;
      }
      case 'weather_data': {
        const p = slide.payload as WeatherDataPayload;
        if (p.photoUri) imageUriSet.add(p.photoUri);
        break;
      }
      case 'temperature_data': {
        const p = slide.payload as TemperatureDataPayload;
        if (p.photoUri) imageUriSet.add(p.photoUri);
        break;
      }
      case 'altitude_data': {
        const p = slide.payload as AltitudeDataPayload;
        if (p.lowest.photoUri) imageUriSet.add(p.lowest.photoUri);
        if (p.highest.photoUri) imageUriSet.add(p.highest.photoUri);
        break;
      }
      case 'end_of_trip_photos': {
        const p = slide.payload as EndPhotosPayload;
        p.postcards.forEach((pc) => postcardMap.set(pc.photoUri, pc));
        break;
      }
      // No assets to preload:
      case 'opening_stats': break;
      case 'activity_multiple_choice': break;
      case 'activity_distribution_graph': break;
      case 'color_palette': break;
      case 'emotion_data': break;
      case 'journal_data': break;
      case 'location_data': break;
    }
  }

  return {
    imageUris: [...imageUriSet],
    postcardItems: [...postcardMap.values()],
    needsMap,
    mapProps,
  };
}

// Prefetches all images into expo-image's (Nuke on iOS) memory+disk cache.
// expo-image's Image.prefetch works for local file:// URIs.
// Resolves when images are cached or after timeoutMs, whichever comes first.
export async function preloadAssets(
  assets: PreloadAssets,
  opts: { timeoutMs?: number } = {}
): Promise<void> {
  const { timeoutMs = 5000 } = opts;

  const timeout = new Promise<void>((resolve) => setTimeout(resolve, timeoutMs));

  const work = async () => {
    const allUris = [
      ...assets.imageUris,
      ...assets.postcardItems.map((pc) => pc.photoUri),
    ].filter(Boolean);

    const tasks: Promise<unknown>[] = [];

    if (allUris.length > 0) {
      tasks.push(ExpoImage.prefetch(allUris).catch(() => {}));
    }

    if (assets.needsMap) {
      tasks.push(preloadMap());
    }

    await Promise.all(tasks);
  };

  await Promise.race([work(), timeout]);
}
