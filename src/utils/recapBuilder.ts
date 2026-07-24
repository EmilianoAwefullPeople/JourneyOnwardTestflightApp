import { Entry } from '../models/Entry';
import { Journal } from '../models/Journal';
import type {
  RecapCandidate,
  RecapSlide,
  RecapSlideType,
  OpeningScreenPayload,
  TitleCardPayload,
  OpeningStatsPayload,
  BeginningPhotosPayload,
  ActivityMultipleChoicePayload,
  ActivityDistributionPayload,
  ColorPalettePayload,
  ColorPalettePhotoPayload,
  EmotionDataPayload,
  JournalDataPayload,
  LocationDataPayload,
  GraphicLocationDataPayload,
  MiddlePhotosPayload,
  WeatherDataPayload,
  TemperatureDataPayload,
  AltitudeDataPayload,
  EndPhotosPayload,
  PostcardItem,
} from '../models/Recap';
import {
  getPhotoUri,
  getEntriesWithPhotos,
  selectFromPercentile,
  extractTripColors,
  getDistinctLocations,
  aggregateWeather,
  aggregateEmotions,
  computeTripDays,
  formatDateRange,
  computePhotosCount,
  computeJournalStats,
  getLocationsByFrequency,
  getEntryLocationLabel,
  computeActivityChoiceData,
  computeActivityDistribution,
  selectLowSaturationPhotoEntry,
  findClosestToAvgTempEntry,
  findAltitudeExtremes,
} from './recapUtils';

function toPostcardItem(entry: Entry): PostcardItem {
  return {
    photoUri: getPhotoUri(entry)!,
    location: getEntryLocationLabel(entry),
  };
}

export function buildRecapSlides(
  candidate: RecapCandidate,
  entries: Entry[],
  journals: Journal[]
): RecapSlide[] {
  const album = candidate.album;

  const nonDraft = entries
    .filter((e) => e.albumId === album.id && !e.isDraft)
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  if (nonDraft.length === 0) return [];

  const withPhotos = getEntriesWithPhotos(nonDraft);
  const albumJournals = journals.filter((j) => j.albumId === album.id);
  const startDate = album.startDate;
  const endDate = album.endDate ?? album.startDate;
  const tripDays = computeTripDays(startDate, endDate);
  const dateRangeStr = formatDateRange(startDate, album.endDate);
  const allColors = extractTripColors(nonDraft);
  const locations = getDistinctLocations(nonDraft);
  const weatherAgg = aggregateWeather(nonDraft);
  const emotionAgg = aggregateEmotions(nonDraft);
  const locationsByFreq = getLocationsByFrequency(nonDraft);

  const slides: RecapSlide[] = [];
  let slideIndex = 0;
  const nextId = () => `recap-${candidate.id}-${slideIndex++}`;

  function push(
    type: RecapSlideType,
    durationMs: number,
    payload: RecapSlide['payload'],
    interactive?: boolean
  ) {
    slides.push({ id: nextId(), type, durationMs, payload, interactive });
  }

  // ── ACT I ──────────────────────────────────────────────────────────────────

  // opening_screen — up to 6 photos, bookmark-prioritized, whole trip
  const openingPool = selectFromPercentile(nonDraft, 0, 1, 6, true);
  if (openingPool.length > 0) {
    push('opening_screen', openingPool.length * 1000, {
      postcards: openingPool.map(toPostcardItem),
    } as OpeningScreenPayload);
  }

  // title_card — always
  push('title_card', 30000, {
    tripName: candidate.displayName,
    dateRange: dateRangeStr,
    backgroundPhotoUri: withPhotos[0] ? getPhotoUri(withPhotos[0])! : undefined,
  } as TitleCardPayload);

  // opening_stats — always
  push('opening_stats', 6500, {
    tripDays,
    memoriesCount: nonDraft.length,
    photosCount: computePhotosCount(nonDraft),
    journalCount: albumJournals.length,
  } as OpeningStatsPayload);

  // beginning_of_trip_photos — first 35%, need at least 2 photos
  const beginningPool = selectFromPercentile(nonDraft, 0, 0.35, 3, false);
  if (beginningPool.length >= 2) {
    const bgEntry = beginningPool[0];
    const postcardEntries = beginningPool.slice(1);
    push('beginning_of_trip_photos', 5000, {
      bgPhotoUri: getPhotoUri(bgEntry)!,
      postcards: postcardEntries.map(toPostcardItem),
    } as BeginningPhotosPayload);
  }

  // ── ACT II ─────────────────────────────────────────────────────────────────

  // activity_multiple_choice — conditional (≥2 days, unique peak day)
  const choiceData = computeActivityChoiceData(nonDraft, album.id);
  if (choiceData) {
    push(
      'activity_multiple_choice',
      30000,
      {
        peakDay: choiceData.peakDay,
        choices: choiceData.choices,
      } as ActivityMultipleChoicePayload,
      true // interactive
    );
  }

  // activity_distribution_graph — ≥2 distinct days with entries
  const distinctDays = new Set(nonDraft.map((e) => e.timestamp.slice(0, 10))).size;
  if (distinctDays >= 2) {
    const distrib = computeActivityDistribution(nonDraft, startDate, endDate);
    push('activity_distribution_graph', 7000, {
      data: distrib.data,
      xAxisMode: distrib.xAxisMode,
    } as ActivityDistributionPayload);
  }

  // color_palette — always (fallback palette if no data)
  push('color_palette', 5000, {
    colors: allColors,
    tripLabel: candidate.displayName,
  } as ColorPalettePayload);

  // color_palette_photo — entry with lowest saturation palette
  const lowSatEntry = selectLowSaturationPhotoEntry(nonDraft);
  if (lowSatEntry) {
    const palette = lowSatEntry.colorPalettes?.[0] ?? allColors;
    push('color_palette_photo', 5000, {
      colors: palette,
      photoUri: getPhotoUri(lowSatEntry)!,
    } as ColorPalettePhotoPayload);
  }

  // emotion_data — ≥1 entry with emotion labels
  const entriesWithEmotions = nonDraft.filter((e) => (e.emotionLabels?.length ?? 0) > 0);
  if (entriesWithEmotions.length >= 1 && emotionAgg.length > 0) {
    push('emotion_data', 6000, {
      emotions: emotionAgg.slice(0, 8),
    } as EmotionDataPayload);
  }

  // journal_data — ≥1 journal entry
  if (albumJournals.length >= 1) {
    const stats = computeJournalStats(albumJournals);
    push('journal_data', 6500, stats as JournalDataPayload);
  }

  // location_data — ≥1 entry with city or country
  if (locationsByFreq.length >= 1) {
    push('location_data', 6500, {
      totalPlaces: locationsByFreq.length,
      topPlaces: locationsByFreq.slice(0, 4).map((l) => ({ name: l.name, count: l.count })),
    } as LocationDataPayload);
  }

  // graphic_location_data — ≥2 distinct locations with coordinates
  if (locations.length >= 2) {
    // Pick a postcard entry from the most-visited location
    const topLocationName = locationsByFreq[0]?.name;
    const postcardEntry = topLocationName
      ? withPhotos.find(
          (e) => e.city === topLocationName
        ) ?? withPhotos[0]
      : withPhotos[0];

    if (postcardEntry) {
      push('graphic_location_data', 6000, {
        locations,
        cityList: locations.map((l) => l.label).filter(Boolean),
        postcard: toPostcardItem(postcardEntry),
      } as GraphicLocationDataPayload);
    }
  }

  // middle_of_trip_photos — 35–70% percentile, ≥1 photo
  const middlePool = selectFromPercentile(nonDraft, 0.35, 0.70, 4, false);
  if (middlePool.length >= 1) {
    push('middle_of_trip_photos', 6000, {
      photoUris: middlePool.map((e) => getPhotoUri(e)!),
    } as MiddlePhotosPayload);
  }

  // weather_data — ≥1 distinct weather condition
  if (weatherAgg.length >= 1) {
    // Pick photo from the most-frequent weather condition
    const topCondition = weatherAgg[0].condition;
    const photoEntry =
      withPhotos.find((e) => e.weather === topCondition) ?? withPhotos[0];
    if (photoEntry) {
      push('weather_data', 5000, {
        conditions: weatherAgg,
        photoUri: getPhotoUri(photoEntry)!,
      } as WeatherDataPayload);
    }
  }

  // temperature_data — ≥3 entries with temperatureCelsius
  const tempEntries = nonDraft.filter((e) => e.temperatureCelsius != null);
  if (tempEntries.length >= 3) {
    const closestEntry = findClosestToAvgTempEntry(nonDraft);
    if (closestEntry) {
      const temps = tempEntries.map((e) => e.temperatureCelsius!);
      push('temperature_data', 5000, {
        averageCelsius: temps.reduce((a, b) => a + b, 0) / temps.length,
        lowestCelsius: Math.min(...temps),
        highestCelsius: Math.max(...temps),
        photoUri: getPhotoUri(closestEntry)!,
      } as TemperatureDataPayload);
    }
  }

  // altitude_data — ≥2 photo-entries with altitude, spread >100m
  const altExtremes = findAltitudeExtremes(nonDraft);
  if (altExtremes) {
    push('altitude_data', 5000, {
      lowest: {
        altitudeMeters: altExtremes.lowest.altitudeMeters,
        photoUri: getPhotoUri(altExtremes.lowest.entry)!,
      },
      highest: {
        altitudeMeters: altExtremes.highest.altitudeMeters,
        photoUri: getPhotoUri(altExtremes.highest.entry)!,
      },
    } as AltitudeDataPayload);
  }

  // ── ACT III ────────────────────────────────────────────────────────────────

  // end_of_trip_photos — last 30%, up to 6, bookmark-prioritized
  let endPool = selectFromPercentile(nonDraft, 0.70, 1.0, 6, true);
  if (endPool.length === 0) endPool = withPhotos.slice(-3); // fallback
  if (endPool.length > 0) {
    push('end_of_trip_photos', endPool.length * 1000, {
      postcards: endPool.map(toPostcardItem),
    } as EndPhotosPayload);
  }

  return slides;
}
