import React from 'react';
import { ActivityIndicator, type ActivityIndicatorProps } from 'react-native';
import { useTheme } from '../../context/ThemeContext';

type LoadingSpinnerProps = Omit<ActivityIndicatorProps, 'color'> & {
  color?: string;
};

/**
 * Shared loading icon across the app.
 * Defaults to theme primary text color to match scan/loading surfaces.
 */
const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({ color, size = 'large', ...rest }) => {
  const { colors } = useTheme();
  return <ActivityIndicator size={size} color={color ?? colors.textPrimary} {...rest} />;
};

export default LoadingSpinner;
