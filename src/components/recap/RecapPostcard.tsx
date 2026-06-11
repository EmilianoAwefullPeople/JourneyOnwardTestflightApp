import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { FONTS, FONT_WEIGHTS } from '../../config/constants';

interface RecapPostcardProps {
  photoUri: string;
  location?: string;
  tiltDeg?: number;
  width: number;
  onLoad?: () => void;
  onError?: () => void;
}

const RecapPostcard: React.FC<RecapPostcardProps> = ({
  photoUri,
  location,
  tiltDeg = 0,
  width,
  onLoad,
  onError,
}) => {
  const height = Math.round(width * 1.38);
  const innerPad = Math.round(width * 0.04);
  const textAreaHeight = 38;
  const imageHeight = height - innerPad - textAreaHeight;

  return (
    <View
      style={[
        styles.card,
        {
          width,
          height,
          transform: [{ rotate: `${tiltDeg}deg` }],
        },
      ]}
    >
      <View
        style={{
          marginTop: innerPad,
          marginHorizontal: innerPad,
          height: imageHeight,
          backgroundColor: '#D0D0D0',
          overflow: 'hidden',
          borderRadius: 2,
        }}
      >
        <Image
          source={{ uri: photoUri }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          cachePolicy="memory-disk"
          transition={0}
          onLoad={onLoad}
          onError={onError}
        />
      </View>
      <View style={[styles.labelArea, { height: textAreaHeight }]}>
        {!!location && (
          <Text style={styles.labelText} numberOfLines={1}>
            {location}
          </Text>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 3,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 10,
  },
  labelArea: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  labelText: {
    fontFamily: FONTS.inter,
    fontSize: 11,
    fontWeight: FONT_WEIGHTS.semibold,
    color: '#2A2A2A',
    textAlign: 'center',
    letterSpacing: 0.3,
  },
});

export default RecapPostcard;
