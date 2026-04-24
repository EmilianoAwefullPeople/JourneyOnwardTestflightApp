// FlashIcon
// Uses Ionicons flash-outline (camera flash; use flash when active in callers)

import React from 'react';
import { Ionicons } from '@expo/vector-icons';

interface FlashIconProps {
  width?: number;
  height?: number;
  color?: string;
}

const FlashIcon: React.FC<FlashIconProps> = ({
  width = 20,
  height = 24,
  color = '#FFFFFF',
}) => {
  const size = Math.max(1, Math.min(Number(width) || 20, Number(height) || 24));
  return (
    <Ionicons
      name="flash-outline"
      size={size}
      color={color ?? '#FFFFFF'}
    />
  );
};

export default FlashIcon;
