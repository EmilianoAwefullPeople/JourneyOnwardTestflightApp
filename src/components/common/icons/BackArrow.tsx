// BackArrow
// Back arrow icon component matching Figma design
// Based on Figma node 346:46 - arrow_back icon

import React from 'react';
import { Svg, Path } from 'react-native-svg';

interface BackArrowProps {
  width?: number;
  height?: number;
  color?: string;
}

const BackArrow: React.FC<BackArrowProps> = ({
  width = 19,
  height = 21,
  color = '#FFFFFF',
}) => {
  return (
    <Svg width={width} height={height} viewBox="0 0 19 21" fill="none">
      <Path
        d="M6.19481 11.375L10.6281 16.275L9.50002 17.5L3.16669 10.5L9.50002 3.5L10.6281 4.725L6.19481 9.625H15.8334V11.375H6.19481Z"
        fill={color}
      />
    </Svg>
  );
};

export default BackArrow;
