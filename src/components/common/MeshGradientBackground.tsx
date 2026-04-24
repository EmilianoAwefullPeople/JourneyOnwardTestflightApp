import React from 'react';
import { View, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

interface MeshGradientBackgroundProps {
  baseColor?: string;
  lightMode?: boolean;
  /** Up to 3 accent colors (full-opacity strings, e.g. 'rgba(180,90,30,1)').
   *  Slot 0 → top-right glow. Slot 1 → bottom-left glow. Slot 2 → center-left glow. */
  accentColors?: [string?, string?, string?];
  /** 0–1 multiplier applied to all accent layer opacities. Default 1.0. */
  accentIntensity?: number;
}

/** Parse 'rgba(r,g,b,a)' or 'rgb(r,g,b)' into components, returns null on failure. */
function parseRgba(color: string): { r: number; g: number; b: number } | null {
  const m = color.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (!m) return null;
  return { r: parseInt(m[1], 10), g: parseInt(m[2], 10), b: parseInt(m[3], 10) };
}

function withOpacity(color: string, opacity: number): string {
  const c = parseRgba(color);
  if (!c) return color;
  return `rgba(${c.r}, ${c.g}, ${c.b}, ${opacity.toFixed(3)})`;
}

// Fixed blob opacities — intensity is handled by the wrapping Animated.View.
const BLOB_PEAK = 0.22;
const BLOB_MID  = 0.13;

export const MeshGradientBackground: React.FC<MeshGradientBackgroundProps> = ({
  baseColor = '#141212',
  lightMode = false,
  accentColors,
  accentIntensity = 1.0,
}) => {
  const o1 = lightMode ? 0.12 : 0.6;
  const o2 = lightMode ? 0.08 : 0.4;
  const o3 = lightMode ? 0.06 : 0.3;
  const o4 = lightMode ? 0.06 : 0.3;

  const [c0, c1, c2] = accentColors ?? [];
  const hasAccents = c0 || c1 || c2;

  return (
    <View style={styles.container}>
      <View style={[styles.base, { backgroundColor: baseColor }]} />

      {/* ── dark-shading layers ── */}
      <LinearGradient
        colors={[`rgba(0, 0, 0, ${o1})`, 'rgba(0, 0, 0, 0)']}
        locations={[0, 0.7]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0.8, y: 0.8 }}
        style={styles.gradientLayer}
      />
      <LinearGradient
        colors={['rgba(0, 0, 0, 0)', `rgba(0, 0, 0, ${o2})`]}
        locations={[0.3, 1]}
        start={{ x: 0.2, y: 0.2 }}
        end={{ x: 1, y: 1 }}
        style={styles.gradientLayer}
      />
      <LinearGradient
        colors={[`rgba(30, 30, 30, ${o3})`, 'rgba(20, 18, 18, 0)']}
        locations={[0, 0.6]}
        start={{ x: 0.5, y: 0.3 }}
        end={{ x: 0.5, y: 0.8 }}
        style={styles.gradientLayer}
      />
      <LinearGradient
        colors={['rgba(0, 0, 0, 0)', `rgba(0, 0, 0, ${o4})`]}
        locations={[0.4, 1]}
        start={{ x: 0.7, y: 0 }}
        end={{ x: 1, y: 0.6 }}
        style={styles.gradientLayer}
      />

      {/* ── accent blobs ── */}
      {hasAccents && (
        <View style={[styles.gradientLayer, { opacity: accentIntensity }]}>
          {/* blob 0: top-right */}
          {c0 && (
            <>
              <LinearGradient
                colors={[withOpacity(c0, BLOB_PEAK), withOpacity(c0, BLOB_MID), 'rgba(0,0,0,0)']}
                locations={[0, 0.35, 1]}
                start={{ x: 1, y: 0 }}
                end={{ x: 0.15, y: 0.65 }}
                style={styles.gradientLayer}
              />
              <LinearGradient
                colors={[withOpacity(c0, BLOB_MID), 'rgba(0,0,0,0)']}
                locations={[0, 1]}
                start={{ x: 1, y: 0 }}
                end={{ x: 0.4, y: 1 }}
                style={styles.gradientLayer}
              />
            </>
          )}

          {/* blob 1: bottom-left */}
          {c1 && (
            <>
              <LinearGradient
                colors={['rgba(0,0,0,0)', withOpacity(c1, BLOB_MID), withOpacity(c1, BLOB_PEAK)]}
                locations={[0, 0.65, 1]}
                start={{ x: 0, y: 0.35 }}
                end={{ x: 0.85, y: 1 }}
                style={styles.gradientLayer}
              />
              <LinearGradient
                colors={['rgba(0,0,0,0)', withOpacity(c1, BLOB_MID)]}
                locations={[0, 1]}
                start={{ x: 0.6, y: 0 }}
                end={{ x: 0, y: 1 }}
                style={styles.gradientLayer}
              />
            </>
          )}

          {/* blob 2: center-left (optional third color) */}
          {c2 && (
            <LinearGradient
              colors={[withOpacity(c2, BLOB_MID), 'rgba(0,0,0,0)']}
              locations={[0, 1]}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 0.7, y: 0.5 }}
              style={styles.gradientLayer}
            />
          )}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 0,
  },
  base: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  gradientLayer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
});
