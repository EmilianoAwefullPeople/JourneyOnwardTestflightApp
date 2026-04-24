// LocationIcon
// Map-pin style icon for location labels

import React from 'react';
import { Svg, Path } from 'react-native-svg';

interface LocationIconProps {
  width?: number;
  height?: number;
  color?: string;
}

const LocationIcon: React.FC<LocationIconProps> = ({
  width = 14,
  height = 14,
  color = '#FFFFFF',
}) => {
  return (
    <Svg width={width} height={height} viewBox="0 0 12 16" fill="none">
      <Path
        d="M6 0C2.686 0 0 2.686 0 6c0 4.5 6 10 6 10s6-5.5 6-10c0-3.314-2.686-6-6-6zm0 8.25a2.25 2.25 0 110-4.5 2.25 2.25 0 010 4.5z"
        fill={color}
      />
    </Svg>
  );
};

export default LocationIcon;
