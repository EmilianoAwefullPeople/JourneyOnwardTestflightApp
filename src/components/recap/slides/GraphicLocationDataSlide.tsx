import React, { useMemo } from 'react';
import { Animated, Dimensions, StyleSheet, Text, View } from 'react-native';
import RecapPostcard from '../RecapPostcard';
import type { PostcardItem } from '../../../models/Recap';
import { FONTS, FONT_WEIGHTS } from '../../../config/constants';
import { useRecapScaleEntrance } from '../motion/useRecapScaleEntrance';
import { useRecapStaggerEntrance } from '../motion/useRecapStaggerEntrance';

const { width: SW, height: SH } = Dimensions.get('window');
export const MAP_HEIGHT = Math.round(SH * 0.46);
const CARD_WIDTH = Math.round(SW * 0.44);

interface LocationPin {
  latitude: number;
  longitude: number;
  label: string;
}

interface Props {
  locations: LocationPin[];
  cityList: string[];
  postcard: PostcardItem;
}

const GraphicLocationDataSlide: React.FC<Props> = ({ cityList, postcard }) => {
  const displayCities = useMemo(
    () => cityList.filter(Boolean).slice(0, 6).join('  ·  '),
    [cityList]
  );
  const citiesEntrance = useRecapStaggerEntrance({ index: 0, baseDelay: 400 });
  const postcardEntrance = useRecapScaleEntrance({ index: 1, baseDelay: 520 });

  return (
    <View style={styles.container}>
      <View style={styles.mapPlaceholder} />

      {displayCities.length > 0 && (
        <Animated.Text style={[styles.cities, citiesEntrance.style]} numberOfLines={2}>
          {displayCities}
        </Animated.Text>
      )}

      <Animated.View style={[styles.postcardWrap, postcardEntrance.style]}>
        <RecapPostcard
          photoUri={postcard.photoUri}
          location={postcard.location}
          tiltDeg={2}
          width={CARD_WIDTH}
        />
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: SW,
    height: SH,
    backgroundColor: '#141212',
    alignItems: 'center',
  },
  mapPlaceholder: {
    width: SW,
    height: MAP_HEIGHT,
  },
  cities: {
    fontFamily: FONTS.inter,
    fontSize: 13,
    fontWeight: FONT_WEIGHTS.regular,
    color: 'rgba(255,255,255,0.55)',
    marginTop: 16,
    marginBottom: 20,
    textAlign: 'center',
    paddingHorizontal: 24,
    lineHeight: 20,
  },
  postcardWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default GraphicLocationDataSlide;
