// CameraIcon
// Camera icon component matching Figma design with visible lens

import React from 'react';
import { Svg, Path, Circle } from 'react-native-svg';

interface CameraIconProps {
  width?: number;
  height?: number;
  /** Body and lens ring stroke (typically primary text color). */
  color?: string;
  /**
   * Lens “hole” fill. Use a dark tone when `color` is light (e.g. white icon on dark UI)
   * so the lens reads as a cutout. Defaults to white for dark-body icons.
   */
  lensFill?: string;
  /** Optional center glint; defaults to `lensFill`. */
  lensCenterFill?: string;
}

const CameraIcon: React.FC<CameraIconProps> = ({
  width = 25,
  height = 24,
  color = '#141212',
  lensFill = '#FFFFFF',
  lensCenterFill,
}) => {
  const centerFill = lensCenterFill ?? lensFill;
  return (
    <Svg width={width} height={height} viewBox="0 0 25 24" fill="none">
      {/* Camera body */}
      <Path
        d="M23.9583 19C23.9583 19.5304 23.7388 20.0391 23.3481 20.4142C22.9574 20.7893 22.4275 21 21.875 21H3.12499C2.57246 21 2.04255 20.7893 1.65185 20.4142C1.26115 20.0391 1.04166 19.5304 1.04166 19V8C1.04166 7.46957 1.26115 6.96086 1.65185 6.58579C2.04255 6.21071 2.57246 6 3.12499 6H7.29166L9.37499 3H15.625L17.7083 6H21.875C22.4275 6 22.9574 6.21071 23.3481 6.58579C23.7388 6.96086 23.9583 7.46957 23.9583 8V19Z"
        fill={color}
        stroke={color}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Lens outer circle */}
      <Circle
        cx="12.5"
        cy="13"
        r="4"
        fill={lensFill}
        stroke={color}
        strokeWidth="1.5"
      />
      {/* Lens inner circle (smaller highlight) */}
      <Circle
        cx="12.5"
        cy="13"
        r="1"
        fill={centerFill}
      />
    </Svg>
  );
};

export default CameraIcon;
