import React from 'react';
import { Animated, Dimensions, StyleSheet, Text, View } from 'react-native';
import { FONTS, FONT_WEIGHTS } from '../../../config/constants';
import { recapSlideStyles } from '../recapSlideStyles';
import RecapAnimatedTitle from '../motion/RecapAnimatedTitle';
import { useRecapCountUp } from '../motion/useRecapCountUp';
import { useRecapStaggerEntrance } from '../motion/useRecapStaggerEntrance';
import { RECAP_CONTENT_BASE_DELAY_MS } from '../motion/recapMotionConfig';
import LocationIcon from '../../common/icons/LocationIcon';

const { width: SW, height: SH } = Dimensions.get('window');

interface Props {
  totalPlaces: number;
  topPlaces: Array<{ name: string; count: number }>;
}

const LocationDataSlide: React.FC<Props> = ({ totalPlaces, topPlaces }) => {
  const countDisplay = useRecapCountUp(totalPlaces, { delay: RECAP_CONTENT_BASE_DELAY_MS });
  const listEntrance = useRecapStaggerEntrance({ index: 1, baseDelay: 520 });

  return (
    <View style={styles.container}>
      <RecapAnimatedTitle>
        Throughout the trip,{'\n'}you visited
      </RecapAnimatedTitle>

      <Text style={styles.count}>{countDisplay}</Text>
      <Text style={styles.places}>Places</Text>

      {topPlaces.length > 0 && (
        <Animated.View style={[styles.listWrap, listEntrance.style]}>
          <Text style={styles.mainOnesLabel}>The main ones were...</Text>
          {topPlaces.map((p) => (
            <View key={p.name} style={styles.placeRow}>
              <LocationIcon width={18} height={20} color="rgba(255,255,255,0.6)" />
              <Text style={styles.placeName}>{p.name}</Text>
            </View>
          ))}
        </Animated.View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    ...recapSlideStyles.screenWithTopInset,
    paddingHorizontal: 32,
  },
  count: {
    fontFamily: FONTS.inter,
    fontSize: 96,
    fontWeight: FONT_WEIGHTS.semibold,
    color: '#FFFFFF',
    lineHeight: 100,
  },
  places: {
    fontFamily: FONTS.inter,
    fontSize: 24,
    fontWeight: FONT_WEIGHTS.regular,
    color: 'rgba(255,255,255,0.8)',
    marginBottom: SH * 0.07,
  },
  listWrap: {
    gap: 4,
  },
  mainOnesLabel: {
    fontFamily: FONTS.inter,
    fontSize: 16,
    fontWeight: FONT_WEIGHTS.regular,
    color: 'rgba(255,255,255,0.55)',
    marginBottom: 16,
  },
  placeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
  },
  placeName: {
    fontFamily: FONTS.inter,
    fontSize: 17,
    fontWeight: FONT_WEIGHTS.regular,
    color: '#FFFFFF',
  },
});

export default LocationDataSlide;
