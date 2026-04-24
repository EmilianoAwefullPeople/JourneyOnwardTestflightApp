// ThemeContext
// App-wide light/dark theme with persistence. User override only (no system preference).

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ColorScheme, getThemeColors, ThemeColors } from '../config/theme';

const STORAGE_KEY = '@awefull_people:color_scheme';

interface ThemeContextType {
  colorScheme: ColorScheme;
  setColorScheme: (scheme: ColorScheme) => void;
  toggleColorScheme: () => void;
  colors: ThemeColors;
  isDark: boolean;
}

const defaultColors = getThemeColors('dark');

const ThemeContext = createContext<ThemeContextType>({
  colorScheme: 'dark',
  setColorScheme: () => {},
  toggleColorScheme: () => {},
  colors: defaultColors,
  isDark: true,
});

interface ThemeProviderProps {
  children: ReactNode;
}

export const ThemeProvider: React.FC<ThemeProviderProps> = ({ children }) => {
  const [colorScheme, setColorSchemeState] = useState<ColorScheme>('dark');
  const [hydrated, setHydrated] = useState(false);

  const colors = getThemeColors(colorScheme);
  const isDark = colorScheme === 'dark';

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        if (cancelled) return;
        if (stored === 'light' || stored === 'dark') {
          setColorSchemeState(stored);
        }
      } catch (_err) {
        // default stays 'dark'
      } finally {
        if (!cancelled) setHydrated(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const setColorScheme = useCallback((scheme: ColorScheme) => {
    setColorSchemeState(scheme);
    AsyncStorage.setItem(STORAGE_KEY, scheme).catch(() => {});
  }, []);

  const toggleColorScheme = useCallback(() => {
    setColorSchemeState((prev) => {
      const next = prev === 'dark' ? 'light' : 'dark';
      AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {});
      return next;
    });
  }, []);

  const value: ThemeContextType = {
    colorScheme: hydrated ? colorScheme : 'dark',
    setColorScheme,
    toggleColorScheme,
    colors: hydrated ? colors : defaultColors,
    isDark: hydrated ? isDark : true,
  };

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export function useTheme(): ThemeContextType {
  const ctx = useContext(ThemeContext);
  if (ctx == null) {
    return {
      colorScheme: 'dark',
      setColorScheme: () => {},
      toggleColorScheme: () => {},
      colors: defaultColors,
      isDark: true,
    };
  }
  return ctx;
}
