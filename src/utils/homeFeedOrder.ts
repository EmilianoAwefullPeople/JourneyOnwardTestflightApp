import type { Entry } from '../models/Entry';
import type { Journal } from '../models/Journal';

export type HomeFeedItem =
  | { type: 'entry'; data: Entry }
  | { type: 'journal'; data: Journal };

export type HomeFeedTopRef = { type: 'entry' | 'journal'; id: string } | null;

/**
 * Deterministic mulberry32 PRNG seeded from a string.
 * Same seed always produces the same sequence, so feed order is stable across
 * AppContext refreshes (e.g. metadata backfill) and only changes when sessionSeed changes.
 */
function makeRng(seedStr: string): () => number {
  // FNV-1a 32-bit hash to turn the string into a numeric seed
  let h = 0x811c9dc5;
  for (let i = 0; i < seedStr.length; i++) {
    h ^= seedStr.charCodeAt(i);
    h = (Math.imul(h, 0x01000193) >>> 0);
  }
  let seed = h;
  return function () {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher–Yates using the provided PRNG. */
function shuffleInPlace<T>(arr: T[], rng: () => number): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function splitByType(items: HomeFeedItem[]): {
  entries: HomeFeedItem[];
  journals: HomeFeedItem[];
} {
  const entries: HomeFeedItem[] = [];
  const journals: HomeFeedItem[] = [];
  for (const it of items) {
    if (it.type === 'journal') journals.push(it);
    else entries.push(it);
  }
  return { entries, journals };
}

/**
 * While there is at least one journal in the list, every scroll window of 5 cards
 * that starts at or before the last journal must include a journal. Windows entirely
 * after the last journal may be entries-only.
 */
export function feedSatisfiesJournalWindowRule(items: HomeFeedItem[]): boolean {
  let lastJ = -1;
  for (let i = 0; i < items.length; i++) {
    if (items[i].type === 'journal') lastJ = i;
  }
  if (lastJ === -1) return true;

  const n = items.length;
  for (let i = 0; i <= n - 5; i++) {
    if (i > lastJ) break;
    let hasJ = false;
    for (let k = i; k < i + 5; k++) {
      if (items[k].type === 'journal') {
        hasJ = true;
        break;
      }
    }
    if (!hasJ) return false;
  }
  return true;
}

/**
 * Merge shuffled entries and journals: never more than 4 consecutive entries while
 * both queues have items; then drain journals then entries (tail may be long runs of entries).
 */
function mergeEntriesJournalsRandom(entryItems: HomeFeedItem[], journalItems: HomeFeedItem[], rng: () => number): HomeFeedItem[] {
  const eQ = [...entryItems];
  const jQ = [...journalItems];
  const result: HomeFeedItem[] = [];
  let eRun = 0;

  while (eQ.length > 0 && jQ.length > 0) {
    if (eRun >= 4) {
      result.push(jQ.shift()!);
      eRun = 0;
      continue;
    }
    if (rng() < 0.5) {
      result.push(eQ.shift()!);
      eRun++;
    } else {
      result.push(jQ.shift()!);
      eRun = 0;
    }
  }
  if (jQ.length > 0) {
    result.push(...jQ, ...eQ);
  } else {
    result.push(...eQ);
  }
  return result;
}

function matchesTop(item: HomeFeedItem, avoid: HomeFeedTopRef): boolean {
  if (!avoid) return false;
  return item.type === avoid.type && item.data.id === avoid.id;
}

/**
 * If the first card was the previous top, swap it with another index that keeps the journal rule.
 */
function avoidRepeatTop(items: HomeFeedItem[], avoid: HomeFeedTopRef, rng: () => number): HomeFeedItem[] {
  if (!avoid || items.length < 2 || !matchesTop(items[0], avoid)) {
    return items;
  }
  const n = items.length;
  const order = Array.from({ length: n - 1 }, (_, i) => i + 1);
  shuffleInPlace(order, rng);
  for (const k of order) {
    const copy = items.slice();
    [copy[0], copy[k]] = [copy[k], copy[0]];
    if (feedSatisfiesJournalWindowRule(copy)) return copy;
  }
  return items;
}

/**
 * Builds a deterministic feed order from a seed string, with journal spacing and
 * optional "not same as last top". Passing the same seed + same items always
 * produces the same order, so AppContext refreshes (e.g. metadata backfill) don't
 * visibly reshuffle the feed.
 */
export function buildOrderedFeedItems(items: HomeFeedItem[], avoidFirst: HomeFeedTopRef, seed: string = ''): HomeFeedItem[] {
  if (items.length === 0) return [];

  const rng = makeRng(seed);
  const { entries, journals } = splitByType(items);
  shuffleInPlace(entries, rng);
  shuffleInPlace(journals, rng);

  let ordered: HomeFeedItem[];
  if (journals.length === 0) {
    ordered = [...entries];
  } else {
    ordered = mergeEntriesJournalsRandom(entries, journals, rng);
  }

  if (!feedSatisfiesJournalWindowRule(ordered)) {
    // Extremely unlikely; fall back to a safe interleave
    ordered = fallbackInterleave(entries, journals);
  }

  return avoidRepeatTop(ordered, avoidFirst, rng);
}

/** Deterministic safe merge if random merge ever violates constraints. */
function fallbackInterleave(entries: HomeFeedItem[], journals: HomeFeedItem[]): HomeFeedItem[] {
  if (journals.length === 0) return [...entries];
  const eQ = [...entries];
  const jQ = [...journals];
  const result: HomeFeedItem[] = [];
  let eRun = 0;
  while (eQ.length > 0 && jQ.length > 0) {
    if (eRun >= 4) {
      result.push(jQ.shift()!);
      eRun = 0;
    } else {
      result.push(eQ.shift()!);
      eRun++;
    }
  }
  result.push(...jQ, ...eQ);
  return result;
}
