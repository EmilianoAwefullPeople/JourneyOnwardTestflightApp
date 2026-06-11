// App.tsx
// Root component with deferred navigation initialization
// This prevents "expected dynamic type 'boolean', but had type 'string'" errors

import React, { useState, useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useFonts } from 'expo-font';
import { PermanentMarker_400Regular } from '@expo-google-fonts/permanent-marker';
import { Caveat_400Regular } from '@expo-google-fonts/caveat';
import { AppProvider } from './src/context/AppContext';
import { ThemeProvider, useTheme } from './src/context/ThemeContext';
import LoadingScreen from './src/screens/LoadingScreen';
import DailyAppOpenCountryCapture from './src/components/DailyAppOpenCountryCapture';

// DO NOT import AppNavigator at top level - lazy-load it instead
// This prevents native module registration during app startup

const AppContent: React.FC = () => {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Critical: Delay navigation until React Native bridge is ready
    // This prevents native modules from initializing too early
    const timer = setTimeout(() => {
      setReady(true);
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  if (!ready) {
    return (
      <>
        <StatusBarWrapper />
        <LoadingScreen />
      </>
    );
  }

  const AppNavigator = require('./src/navigation/AppNavigator').AppNavigator;
  return (
    <>
      <StatusBarWrapper />
      <DailyAppOpenCountryCapture />
      <AppNavigator />
    </>
  );
};

const StatusBarWrapper: React.FC = () => {
  const { isDark } = useTheme();
  return <StatusBar style={isDark ? 'light' : 'dark'} />;
};

export default function App() {
  const [fontsLoaded, fontError] = useFonts({
    PermanentMarker_400Regular,
    Caveat_400Regular,
  });

  // Show LoadingScreen until fonts are ready or failed — never hang.
  const fontsReady = fontsLoaded || fontError !== null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AppProvider>
        <ThemeProvider>
          <SafeAreaProvider>
            {fontsReady ? <AppContent /> : <LoadingScreen />}
          </SafeAreaProvider>
        </ThemeProvider>
      </AppProvider>
    </GestureHandlerRootView>
  );
}
