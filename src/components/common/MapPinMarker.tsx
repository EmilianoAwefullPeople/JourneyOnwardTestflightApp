// MapPinMarker
// Minimalistic map pin for entry markers (Review map, InteractiveMap).
// Teardrop shape, single color — Strava/Apple Maps style.

import React from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Defs, LinearGradient as SvgLinearGradient, Stop, Path, Circle } from 'react-native-svg';

const PIN_WIDTH = 28;
const PIN_HEIGHT = 36;
// Teardrop: circle top, point bottom; anchor at tip for map alignment
const PIN_PATH =
  'M14 2C8.477 2 4 6.477 4 12c0 6 10 22 10 22s10-16 10-22c0-5.523-4.477-10-10-10z';

interface MapPinMarkerProps {
  width?: number;
  height?: number;
  color?: string;
}

const MapPinMarker: React.FC<MapPinMarkerProps> = ({
  width = PIN_WIDTH,
  height = PIN_HEIGHT,
  color = '#2E2E2E',
}) => {
  return (
    <View style={[styles.wrapper, { width, height }]}>
      <Svg width={width} height={height} viewBox="0 0 28 36" fill="none">
        <Defs>
          <SvgLinearGradient id="pinGradient" x1="14" y1="2" x2="14" y2="34">
            <Stop offset="0" stopColor={color} stopOpacity={0.95} />
            <Stop offset="1" stopColor={color} stopOpacity={1} />
          </SvgLinearGradient>
        </Defs>
        <Path d={PIN_PATH} fill="url(#pinGradient)" />
        <Circle cx={14} cy={12} r={5.5} fill="#FFFFFF" fillOpacity={0.96} />
      </Svg>
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    alignItems: 'center',
    justifyContent: 'flex-end',
    backgroundColor: 'transparent',
  },
});

export default MapPinMarker;
export { PIN_WIDTH, PIN_HEIGHT };
