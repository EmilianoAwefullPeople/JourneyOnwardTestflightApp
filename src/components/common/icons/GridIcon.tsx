// GridIcon
// 4-square grid icon for Pinterest-style gallery view toggle

import React from 'react';
import { Svg, Rect } from 'react-native-svg';

interface GridIconProps {
  width?: number;
  height?: number;
  color?: string;
}

const GridIcon: React.FC<GridIconProps> = ({
  width = 20,
  height = 20,
  color = '#FFFFFF',
}) => {
  const size = 8;
  const gap = 2;
  return (
    <Svg width={width} height={height} viewBox="0 0 20 20" fill="none">
      <Rect x={0} y={0} width={size} height={size} rx={1} fill={color} />
      <Rect x={size + gap} y={0} width={size} height={size} rx={1} fill={color} />
      <Rect x={0} y={size + gap} width={size} height={size} rx={1} fill={color} />
      <Rect x={size + gap} y={size + gap} width={size} height={size} rx={1} fill={color} />
    </Svg>
  );
};

export default GridIcon;
