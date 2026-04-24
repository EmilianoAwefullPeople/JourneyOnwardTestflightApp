// EntryPhotoImage — local file/remote URI with onError fallback (avoids empty gray tiles when load fails)

import React, { useState } from 'react';
import { View, Image, ImageStyle, StyleProp, Text } from 'react-native';

type Props = {
  uri: string;
  style: StyleProp<ImageStyle>;
  resizeMode?: 'cover' | 'contain' | 'stretch' | 'center' | 'repeat';
  fallbackBackgroundColor: string;
};

export const EntryPhotoImage: React.FC<Props> = ({
  uri,
  style,
  resizeMode = 'cover',
  fallbackBackgroundColor,
}) => {
  const [broken, setBroken] = useState(false);

  if (broken) {
    return (
      <View
        style={[
          style,
          {
            backgroundColor: fallbackBackgroundColor,
            alignItems: 'center',
            justifyContent: 'center',
          },
        ]}
      >
        <Text style={{ fontSize: 22 }} maxFontSizeMultiplier={1.25}>
          📷
        </Text>
      </View>
    );
  }

  return (
    <Image
      source={{ uri }}
      style={style}
      resizeMode={resizeMode}
      onError={() => setBroken(true)}
    />
  );
};
