// AppTextInput
// Wraps React Native TextInput with maxFontSizeMultiplier for Dynamic Type (Larger Text) support.
// Caps scaling so layout remains stable while respecting accessibility text size.

import React from 'react';
import { TextInput, TextInputProps } from 'react-native';

const DEFAULT_MAX_FONT_SIZE_MULTIPLIER = 1.5;

export type AppTextInputProps = TextInputProps & {
  /** Cap for system font scaling (default 1.5). */
  maxFontSizeMultiplier?: number | null;
};

const AppTextInput = React.forwardRef<TextInput, AppTextInputProps>(function AppTextInput(
  { maxFontSizeMultiplier = DEFAULT_MAX_FONT_SIZE_MULTIPLIER, ...rest },
  ref
) {
  return (
    <TextInput
      ref={ref}
      maxFontSizeMultiplier={maxFontSizeMultiplier}
      {...rest}
    />
  );
});

export default AppTextInput;
