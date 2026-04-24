// GrainOverlay
// Subtle noise/grain overlay for Organic Mesh backgrounds.
// Uses a simple semi-transparent overlay (fallback); SVG FeTurbulence can be used where supported.

import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';

interface GrainOverlayProps {
  style?: ViewStyle;
}

/**
 * Renders a full-screen grain overlay. On native, FeTurbulence is often unsupported,
 * so we use a subtle neutral overlay (~3–4% opacity) for a slight texture feel
 * without darkening the mesh. For web or when SVG filters are supported,
 * a FeTurbulence-based overlay can be used instead.
 */
const GrainOverlay: React.FC<GrainOverlayProps> = ({ style }) => {
  return (
    <View
      style={[styles.overlay, style]}
      pointerEvents="none"
    />
  );
};

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    // Subtle light overlay so mesh doesn't look flat; avoids darkening (per design system)
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
  },
});

export default GrainOverlay;
