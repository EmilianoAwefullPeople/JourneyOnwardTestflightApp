// CameraSwitchIcon
// Uses Ionicons camera-reverse (front/back camera switch)

import React from 'react';
import { Ionicons } from '@expo/vector-icons';

interface CameraSwitchIconProps {
  width?: number;
  height?: number;
  color?: string;
}

const CameraSwitchIcon: React.FC<CameraSwitchIconProps> = ({
  width = 24,
  height = 24,
  color = '#FFFFFF',
}) => {
  const size = Math.max(1, Math.min(Number(width) || 24, Number(height) || 24));
  return (
    <Ionicons
      name="camera-reverse"
      size={size}
      color={color ?? '#FFFFFF'}
    />
  );
};

export default CameraSwitchIcon;
