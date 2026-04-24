// ProgressContext
// Milestone progress state and recording for Journey & Missions (Studio)

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState, ReactNode } from 'react';
import type { ReviewSectionParam } from '../navigation/types';
import {
  loadProgress,
  saveProgress,
  type MilestoneKey,
  type ProgressState,
  type TripAlbumSection,
} from '../utils/progressStorage';

const MILESTONE_ORDER: { key: MilestoneKey; label: string }[] = [
  { key: 'trip_album_created', label: 'Create A Trip Album' },
  { key: 'first_live_capture', label: 'Capture Your First Experience' },
  { key: 'first_journal', label: 'Create A Journal Entry' },
  { key: 'first_past_memory', label: 'Add Past Experiences' },
  { key: 'review_explorer', label: 'Explore All Review Tabs' },
  { key: 'album_explorer', label: 'Explore An Album (All, Dashboard, Map)' },
];

const ALL_REVIEW_SECTIONS: ReviewSectionParam[] = [
  'bookmarks',
  'journal',
  'map',
  'timeline',
  'tripAlbums',
  'stats',
];

export interface PathStep {
  key: MilestoneKey;
  label: string;
  completed: boolean;
  isNext: boolean;
}

interface ProgressContextType {
  pathSteps: PathStep[];
  nextUp: PathStep | null;
  record: (key: MilestoneKey) => void;
  recordReviewSection: (section: ReviewSectionParam) => void;
  recordTripAlbumSection: (albumId: string, section: TripAlbumSection) => void;
}

const ProgressContext = createContext<ProgressContextType | undefined>(undefined);

const DEFAULT_STATE: ProgressState = {
  achievements: {},
  visitedReviewSections: [],
  visitedTripAlbumSections: {},
};

interface ProgressProviderProps {
  children: ReactNode;
}

export const ProgressProvider: React.FC<ProgressProviderProps> = ({ children }) => {
  const [state, setState] = useState<ProgressState>(DEFAULT_STATE);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadProgress().then((loadedState) => {
      if (!cancelled) {
        setState(loadedState);
        setLoaded(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const record = useCallback(
    (key: MilestoneKey) => {
      if (!loaded) return;
      setState((prev) => {
        if (prev.achievements[key]) return prev;
        const next: ProgressState = {
          ...prev,
          achievements: { ...prev.achievements, [key]: { unlockedAt: Date.now() } },
        };
        saveProgress(next).catch(() => {});
        return next;
      });
    },
    [loaded]
  );

  const recordReviewSection = useCallback(
    (section: ReviewSectionParam) => {
      if (!loaded) return;
      setState((prev) => {
        const set = new Set(prev.visitedReviewSections);
        if (set.has(section)) return prev;
        set.add(section);
        const visitedReviewSections = Array.from(set);
        const next: ProgressState = {
          ...prev,
          visitedReviewSections,
        };
        const hasAll = ALL_REVIEW_SECTIONS.every((s) => set.has(s));
        if (hasAll && !prev.achievements.review_explorer) {
          next.achievements = { ...next.achievements, review_explorer: { unlockedAt: Date.now() } };
        }
        saveProgress(next).catch(() => {});
        return next;
      });
    },
    [loaded]
  );

  const recordTripAlbumSection = useCallback(
    (albumId: string, section: TripAlbumSection) => {
      if (!loaded) return;
      setState((prev) => {
        const albumSections = prev.visitedTripAlbumSections[albumId] ?? [];
        if (albumSections.includes(section)) return prev;
        const nextList = [...albumSections, section];
        const visitedTripAlbumSections = {
          ...prev.visitedTripAlbumSections,
          [albumId]: nextList,
        };
        const next: ProgressState = {
          ...prev,
          visitedTripAlbumSections,
        };
        const anyAlbumHasAll = Object.values(visitedTripAlbumSections).some((arr) => {
          const hasAll = arr.includes('all');
          const hasMap = arr.includes('map');
          const hasDashboard = arr.includes('dashboard') || arr.includes('timeline');
          return hasAll && hasMap && hasDashboard;
        });
        if (anyAlbumHasAll && !prev.achievements.album_explorer) {
          next.achievements = { ...next.achievements, album_explorer: { unlockedAt: Date.now() } };
        }
        saveProgress(next).catch(() => {});
        return next;
      });
    },
    [loaded]
  );

  const pathSteps = useMemo((): PathStep[] => {
    let nextFound = false;
    return MILESTONE_ORDER.map(({ key, label }) => {
      const completed = !!state.achievements[key];
      const isNext = !completed && !nextFound && (nextFound = true);
      return { key, label, completed, isNext };
    });
  }, [state.achievements]);

  const nextUp = useMemo(() => pathSteps.find((s) => s.isNext) ?? null, [pathSteps]);

  const value = useMemo(
    () => ({
      pathSteps,
      nextUp,
      record,
      recordReviewSection,
      recordTripAlbumSection,
    }),
    [pathSteps, nextUp, record, recordReviewSection, recordTripAlbumSection]
  );

  return <ProgressContext.Provider value={value}>{children}</ProgressContext.Provider>;
};

export function useProgress(): ProgressContextType {
  const ctx = useContext(ProgressContext);
  if (ctx === undefined) {
    throw new Error('useProgress must be used within a ProgressProvider');
  }
  return ctx;
}
