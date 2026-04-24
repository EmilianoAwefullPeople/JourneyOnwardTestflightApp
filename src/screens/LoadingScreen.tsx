// LoadingScreen
// Opening screen with Organic Mesh background (no solid green; base gradient + strong light leaks + grain)

import React from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import AppText from '../components/common/AppText';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { FONTS, COLORS } from '../config/constants';
import { TEXT_STYLES } from '../config/typography';
import GrainOverlay from '../components/common/GrainOverlay';
import { useTheme } from '../context/ThemeContext';

// Helper to add alpha to hex colors (assuming COLORS are hex)
const hexToRGBA = (hex: string, alpha: number) => {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

const LoadingScreen: React.FC = () => {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: colors.background,
          paddingTop: insets.top,
          paddingBottom: insets.bottom,
        },
      ]}
    >
      {/* Base layer: full-screen gradient (no solid green) — olive bottom-left, fern center/right, pale-sky top-left */}
      {/* Base Layer: Soft vertical gradient from Baby Blue to Fern/Darker Tone */}
      <LinearGradient
        colors={[
          COLORS.babyBlue,
          hexToRGBA(COLORS.fern, 0.8),
          hexToRGBA(COLORS.fern, 0.4)
        ]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={styles.layer}
      />

      {/* Middle Layer: Large Royal Gold "Bloom" - simulating the yellow center blob */}
      {/* Positioned diagonally to wash over the center-right */}
      <LinearGradient
        colors={[
          hexToRGBA(COLORS.royalGold, 0.6),
          hexToRGBA(COLORS.royalGold, 0.0)
        ]}
        start={{ x: 1, y: 0.2 }}
        end={{ x: 0, y: 0.8 }}
        style={[styles.layer, { opacity: 0.8 }]}
      />

      {/* Top Layer: Stronger Baby Blue / Pinkish glow replacement (using Baby Blue) from Top-Left */}
      <LinearGradient
        colors={[
          hexToRGBA(COLORS.babyBlue, 0.9),
          'transparent'
        ]}
        start={{ x: 0.1, y: 0.1 }}
        end={{ x: 0.6, y: 0.6 }}
        style={styles.layer}
      />

      {/* Bottom Layer: Fern grounding at the bottom */}
      <LinearGradient
        colors={[
          'transparent',
          hexToRGBA(COLORS.fern, 0.9)
        ]}
        start={{ x: 0.5, y: 0.5 }}
        end={{ x: 0.5, y: 1 }}
        style={styles.layer}
      />

      {/* Grain overlay — SVG FeTurbulence or fallback */}
      <GrainOverlay style={styles.grain} />

      <View style={styles.content}>
        <AppText style={[styles.title, { color: colors.textPrimary }]}>Journey Onward</AppText>
        <AppText style={[styles.subtitle, { color: colors.textPrimary }]}>by AweFull People</AppText>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  layer: {
    ...StyleSheet.absoluteFillObject,
  },
  grain: {
    ...StyleSheet.absoluteFillObject,
  },
  content: {
    zIndex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    ...TEXT_STYLES.openingTitle,
    fontFamily: FONTS.playfairDisplay || (Platform.OS === 'ios' ? 'Times New Roman' : 'serif'),
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    ...TEXT_STYLES.openingSubtitle,
    textAlign: 'center',
  },
});

export default LoadingScreen;
