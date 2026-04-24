// CloseIcon
// Close/X icon component matching Figma design
// Based on Figma node 212:836 - X icon

import React from 'react';
import { Svg, Path } from 'react-native-svg';

interface CloseIconProps {
  width?: number;
  height?: number;
  color?: string;
}

const CloseIcon: React.FC<CloseIconProps> = ({
  width = 16,
  height = 16,
  color = '#FFFFFF',
}) => {
  return (
    <Svg width={width} height={height} viewBox="0 0 16 16" fill="none">
      <Path
        d="M12 4L4 12M4 4L12 12"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
};

export default CloseIcon;
