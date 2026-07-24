import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { Dimensions } from 'react-native';
import { useRoute } from '@react-navigation/native';

export type ReportScrollOptions = {
  hideThresholdPx?: number;
  showThresholdPx?: number;
};

type MainTabBarVisibilityContextValue = {
  hidden: boolean;
  visibilityProgress: number;
  setActiveRouteKey: (routeKey: string) => void;
  reportScrollOffset: (routeKey: string, offsetY: number, options?: ReportScrollOptions) => void;
};

const MainTabBarVisibilityContext = createContext<MainTabBarVisibilityContextValue | null>(null);

const SCREEN_HEIGHT = Dimensions.get('window').height;
const HIDE_THRESHOLD_PX = SCREEN_HEIGHT * 0.2;
const SHOW_THRESHOLD_PX = SCREEN_HEIGHT * 0.1;
const SCROLL_DELTA_DEADZONE_PX = 1.5;

export const MainTabBarVisibilityProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [hidden, setHidden] = useState(false);
  const activeRouteKeyRef = useRef<string>('');
  const lastOffsetYByRouteRef = useRef<Record<string, number>>({});
  const downDistanceByRouteRef = useRef<Record<string, number>>({});
  const upDistanceByRouteRef = useRef<Record<string, number>>({});

  const setActiveRouteKey = useCallback((routeKey: string) => {
    if (!routeKey || routeKey === activeRouteKeyRef.current) return;
    activeRouteKeyRef.current = routeKey;
    setHidden(false);
    downDistanceByRouteRef.current[routeKey] = 0;
    upDistanceByRouteRef.current[routeKey] = 0;
    lastOffsetYByRouteRef.current[routeKey] = 0;
  }, []);

  const reportScrollOffset = useCallback((routeKey: string, rawOffsetY: number, options?: ReportScrollOptions) => {
    if (routeKey !== activeRouteKeyRef.current) return;

    const hideThresholdPx = options?.hideThresholdPx ?? HIDE_THRESHOLD_PX;
    const showThresholdPx = options?.showThresholdPx ?? SHOW_THRESHOLD_PX;
    const offsetY = Math.max(0, Number.isFinite(rawOffsetY) ? rawOffsetY : 0);
    const prevOffset = lastOffsetYByRouteRef.current[routeKey] ?? offsetY;
    const delta = offsetY - prevOffset;
    lastOffsetYByRouteRef.current[routeKey] = offsetY;

    if (Math.abs(delta) < SCROLL_DELTA_DEADZONE_PX) {
      return;
    }

    if (offsetY <= 0) {
      downDistanceByRouteRef.current[routeKey] = 0;
      upDistanceByRouteRef.current[routeKey] = 0;
      if (hidden) setHidden(false);
      return;
    }

    if (delta > 0) {
      downDistanceByRouteRef.current[routeKey] = (downDistanceByRouteRef.current[routeKey] ?? 0) + delta;
      upDistanceByRouteRef.current[routeKey] = 0;
      if (!hidden && downDistanceByRouteRef.current[routeKey] >= hideThresholdPx) {
        setHidden(true);
        downDistanceByRouteRef.current[routeKey] = 0;
      }
      return;
    }

    if (delta < 0) {
      upDistanceByRouteRef.current[routeKey] = (upDistanceByRouteRef.current[routeKey] ?? 0) + Math.abs(delta);
      downDistanceByRouteRef.current[routeKey] = 0;
      if (hidden && upDistanceByRouteRef.current[routeKey] >= showThresholdPx) {
        setHidden(false);
        upDistanceByRouteRef.current[routeKey] = 0;
      }
    }
  }, [hidden]);

  const value = useMemo(
    () => ({
      hidden,
      visibilityProgress: hidden ? 0 : 1,
      setActiveRouteKey,
      reportScrollOffset,
    }),
    [hidden, reportScrollOffset, setActiveRouteKey]
  );

  return (
    <MainTabBarVisibilityContext.Provider value={value}>
      {children}
    </MainTabBarVisibilityContext.Provider>
  );
};

export const useMainTabBarVisibility = () => {
  const context = useContext(MainTabBarVisibilityContext);
  const route = useRoute();

  if (!context) {
    throw new Error('useMainTabBarVisibility must be used within MainTabBarVisibilityProvider');
  }

  const reportScrollOffset = useCallback((offsetY: number, options?: ReportScrollOptions) => {
    context.reportScrollOffset(route.key, offsetY, options);
  }, [context, route.key]);

  return {
    hidden: context.hidden,
    visibilityProgress: context.visibilityProgress,
    reportScrollOffset,
  };
};

export const useMainTabBarVisibilityController = () => {
  const context = useContext(MainTabBarVisibilityContext);
  if (!context) {
    throw new Error('useMainTabBarVisibilityController must be used within MainTabBarVisibilityProvider');
  }
  return {
    hidden: context.hidden,
    visibilityProgress: context.visibilityProgress,
    setActiveRouteKey: context.setActiveRouteKey,
  };
};
