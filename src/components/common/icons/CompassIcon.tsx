// CompassIcon
// Uses Ionicons compass-outline (aligned with other app icons from @expo/vector-icons)

import React from 'react';
import { Ionicons } from '@expo/vector-icons';

interface CompassIconProps {
  width?: number;
  height?: number;
  color?: string;
}

const CompassIcon: React.FC<CompassIconProps> = ({
  width = 18,
  height = 18,
  color = '#141212',
}) => {
  const size = Math.max(1, Math.min(Number(width) || 18, Number(height) || 18));
  return (
    <Ionicons
      name="compass-outline"
      size={size}
      color={color ?? '#141212'}
    />
  );
};

export default CompassIcon;
