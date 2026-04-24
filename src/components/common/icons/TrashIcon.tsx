// TrashIcon
// Trash can icon for delete action - matches app icon style (line art)

import React from 'react';
import { Svg, Path } from 'react-native-svg';

interface TrashIconProps {
  width?: number;
  height?: number;
  color?: string;
}

const TrashIcon: React.FC<TrashIconProps> = ({
  width = 18,
  height = 18,
  color = '#141212',
}) => {
  return (
    <Svg width={width} height={height} viewBox="0 0 18 18" fill="none">
      <Path
        d="M2 4H16M6 4V2.5C6 2.224 6.224 2 6.5 2H11.5C11.776 2 12 2.224 12 2.5V4M4 4L5 14.5C5 15.328 5.672 16 6.5 16H11.5C12.328 16 13 15.328 13 14.5L14 4M7 7V12M11 7V12"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
};

export default TrashIcon;
