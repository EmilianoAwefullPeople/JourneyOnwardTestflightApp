// AweIcon
// Eye/radar-style icon for Awe-Tag button (central dot, ring, curved lines)
// Matches Figma design for awe-full experience tagging

import React from 'react';
import { Svg, Path, Circle } from 'react-native-svg';

interface AweIconProps {
  width?: number;
  height?: number;
  color?: string;
}

const AweIcon: React.FC<AweIconProps> = ({
  width = 18,
  height = 18,
  color = '#141212',
}) => {
  const cx = 9;
  const cy = 9;
  const ringR = 4;
  const dotR = 1.2;
  return (
    <Svg width={width} height={height} viewBox="0 0 18 18" fill="none">
      <Circle cx={cx} cy={cy} r={dotR} fill={color} />
      <Circle cx={cx} cy={cy} r={ringR} stroke={color} strokeWidth="1.5" fill="none" />
      <Path
        d="M5 5 Q9 9 13 13"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        fill="none"
      />
      <Path
        d="M13 5 Q9 9 5 13"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        fill="none"
      />
    </Svg>
  );
};

export default AweIcon;
