// PenIcon
// Edit / compose icon: pencil over horizontal line (classic edit symbol)

import React from 'react';
import { Svg, Path } from 'react-native-svg';

interface PenIconProps {
  width?: number;
  height?: number;
  color?: string;
}

const PenIcon: React.FC<PenIconProps> = ({
  width = 18,
  height = 18,
  color = '#141212',
}) => {
  return (
    <Svg width={width} height={height} viewBox="0 0 24 24" fill="none">
      {/* Pencil body: diagonal shape, point at bottom-right */}
      <Path
        d="M18 4L20 6L8 18L4 20L6 16L18 4Z"
        stroke={color}
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Horizontal line under the pencil tip */}
      <Path
        d="M4 20H20"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
      />
    </Svg>
  );
};

export default PenIcon;
