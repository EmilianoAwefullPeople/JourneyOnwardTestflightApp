// AppText
// Wraps React Native Text with maxFontSizeMultiplier for Dynamic Type (Larger Text) support.
// Caps scaling so layout remains stable while respecting accessibility text size.

import React from 'react';
import { Text, TextProps } from 'react-native';

const DEFAULT_MAX_FONT_SIZE_MULTIPLIER = 1.5;

export type AppTextProps = TextProps & {
  /** Cap for system font scaling (default 1.5). Use 1.3 for tight UI e.g. tab labels. */
  maxFontSizeMultiplier?: number | null;
};

const AppText: React.FC<AppTextProps> = ({
  maxFontSizeMultiplier = DEFAULT_MAX_FONT_SIZE_MULTIPLIER,
  ...rest
}) => {
  return (
    <Text
      maxFontSizeMultiplier={maxFontSizeMultiplier}
      {...rest}
    />
  );
};

export default AppText;
