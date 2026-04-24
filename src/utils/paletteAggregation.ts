// paletteAggregation
// Aggregates per-photo color palettes from multiple entries into a single ranked palette.
// Uses frequency-weighted greedy clustering in CIELAB space with grid quantization.

import { Entry } from '../models/Entry';
import { hexToLab, labToHex, deltaE76 } from './colorSpace';

const MERGE_THRESHOLD = 15; // ΔE < 15 → same color family

interface WeightedLab {
  lab: [number, number, number];
  weight: number;
}

interface Cluster {
  labSum: [number, number, number];
  totalWeight: number;
}

// ─── Step A: collect weighted colors ─────────────────────────────────────────

function collectWeightedColors(entries: Entry[]): WeightedLab[] {
  const result: WeightedLab[] = [];
  for (const entry of entries) {
    if (!entry.colorPalettes) continue;
    for (const photoColors of entry.colorPalettes) {
      if (!Array.isArray(photoColors)) continue;
      for (let j = 0; j < photoColors.length; j++) {
        const hex = photoColors[j];
        if (typeof hex !== 'string') continue;
        const lab = hexToLab(hex);
        // Discard near-black conversion artifacts (guard for invalid hex)
        if (lab[0] < 3 && lab[1] === 0 && lab[2] === 0) continue;
        const weight = Math.max(1, 8 - j); // index 0 → weight 8, index 7 → weight 1
        result.push({ lab, weight });
      }
    }
  }
  return result;
}

// ─── Step B: grid bucket key ─────────────────────────────────────────────────

function bucketKey(lab: [number, number, number]): string {
  const lBin = Math.min(9, Math.floor(lab[0] / 10));
  const aBin = Math.min(7, Math.floor((lab[1] + 128) / 32));
  const bBin = Math.min(7, Math.floor((lab[2] + 128) / 32));
  return `${lBin}:${aBin}:${bBin}`;
}

// ─── Step C: merge within a list of weighted colors → list of clusters ────────

function mergeToClusters(colors: WeightedLab[]): Cluster[] {
  // Sort by weight descending so dominant colors anchor their clusters
  const sorted = [...colors].sort((a, b) => b.weight - a.weight);
  const clusters: Cluster[] = [];

  for (const { lab, weight } of sorted) {
    let merged = false;
    for (const cluster of clusters) {
      const centroid: [number, number, number] = [
        cluster.labSum[0] / cluster.totalWeight,
        cluster.labSum[1] / cluster.totalWeight,
        cluster.labSum[2] / cluster.totalWeight,
      ];
      if (deltaE76(lab, centroid) < MERGE_THRESHOLD) {
        cluster.labSum[0] += lab[0] * weight;
        cluster.labSum[1] += lab[1] * weight;
        cluster.labSum[2] += lab[2] * weight;
        cluster.totalWeight += weight;
        merged = true;
        break;
      }
    }
    if (!merged) {
      clusters.push({
        labSum: [lab[0] * weight, lab[1] * weight, lab[2] * weight],
        totalWeight: weight,
      });
    }
  }

  return clusters;
}

// ─── Step D: cross-bucket merge ───────────────────────────────────────────────

function crossBucketMerge(clusters: Cluster[]): Cluster[] {
  const sorted = [...clusters].sort((a, b) => b.totalWeight - a.totalWeight);
  const merged: Cluster[] = [];

  for (const cluster of sorted) {
    const centroid: [number, number, number] = [
      cluster.labSum[0] / cluster.totalWeight,
      cluster.labSum[1] / cluster.totalWeight,
      cluster.labSum[2] / cluster.totalWeight,
    ];
    let absorbed = false;
    for (const existing of merged) {
      const existingCentroid: [number, number, number] = [
        existing.labSum[0] / existing.totalWeight,
        existing.labSum[1] / existing.totalWeight,
        existing.labSum[2] / existing.totalWeight,
      ];
      if (deltaE76(centroid, existingCentroid) < MERGE_THRESHOLD) {
        existing.labSum[0] += cluster.labSum[0];
        existing.labSum[1] += cluster.labSum[1];
        existing.labSum[2] += cluster.labSum[2];
        existing.totalWeight += cluster.totalWeight;
        absorbed = true;
        break;
      }
    }
    if (!absorbed) merged.push({ ...cluster, labSum: [...cluster.labSum] as [number, number, number] });
  }

  return merged;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Aggregates colorPalettes from all provided entries into a single dominant palette.
 * Returns up to numColors hex strings, most dominant first.
 * Returns [] if there is not enough data (fewer than 3 distinct color clusters).
 */
export function aggregatePalette(entries: Entry[], numColors = 10): string[] {
  const colors = collectWeightedColors(entries);
  if (colors.length === 0) return [];

  // Group by grid bucket, merge within each bucket
  const buckets = new Map<string, WeightedLab[]>();
  for (const wc of colors) {
    const key = bucketKey(wc.lab);
    const bucket = buckets.get(key);
    if (bucket) bucket.push(wc);
    else buckets.set(key, [wc]);
  }

  const intraClusterResults: Cluster[] = [];
  for (const bucket of buckets.values()) {
    const clusters = mergeToClusters(bucket);
    intraClusterResults.push(...clusters);
  }

  // Merge across bucket boundaries
  const finalClusters = crossBucketMerge(intraClusterResults);

  if (finalClusters.length < 3) return [];

  // Sort by total weight descending, take top N, convert to hex
  return finalClusters
    .sort((a, b) => b.totalWeight - a.totalWeight)
    .slice(0, numColors)
    .map(c => labToHex([
      c.labSum[0] / c.totalWeight,
      c.labSum[1] / c.totalWeight,
      c.labSum[2] / c.totalWeight,
    ]));
}
