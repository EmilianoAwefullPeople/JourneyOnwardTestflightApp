// FeedIcon
// 2 stacked rectangles icon for Instagram-like single-column feed view toggle

import React from 'react';
import { Svg, Rect } from 'react-native-svg';

interface FeedIconProps {
  width?: number;
  height?: number;
  color?: string;
}

const FeedIcon: React.FC<FeedIconProps> = ({
  width = 20,
  height = 20,
  color = '#FFFFFF',
}) => {
  const w = 14;
  const h = 8;
  const gap = 2;
  const left = 3;
  return (
    <Svg width={width} height={height} viewBox="0 0 20 20" fill="none">
      <Rect x={left} y={0} width={w} height={h} rx={1} fill={color} />
      <Rect x={left} y={h + gap} width={w} height={h} rx={1} fill={color} />
    </Svg>
  );
};

export default FeedIcon;
