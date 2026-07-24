// HomeMemoriesFeedControls
// Single icon-spaces for feed order (random | chronological) and layout (gallery | feed)

import React from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import GridIcon from '../common/icons/GridIcon';
import FeedIcon from '../common/icons/FeedIcon';
import ShuffleIcon from '../common/icons/ShuffleIcon';
import CalendarIcon from '../common/icons/CalendarIcon';
import { SPACING } from '../../config/constants';

export type FeedOrderMode = 'random' | 'chronological';
export type FeedViewMode = 'gallery' | 'feed';

type Props = {
  orderMode: FeedOrderMode;
  viewMode: FeedViewMode;
  onToggleOrder: () => void;
  onToggleView: () => void;
  iconColor: string;
};

export const HomeMemoriesFeedControls: React.FC<Props> = ({
  orderMode,
  viewMode,
  onToggleOrder,
  onToggleView,
  iconColor,
}) => {
  const orderIsRandom = orderMode === 'random';
  const viewIsGallery = viewMode === 'gallery';

  return (
    <View style={styles.row}>
      <TouchableOpacity
        style={styles.button}
        onPress={onToggleOrder}
        accessibilityRole="button"
        accessibilityLabel={
          orderIsRandom
            ? 'Order: random. Tap for chronological'
            : 'Order: chronological. Tap for random'
        }
        accessibilityState={{ selected: true }}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        {orderIsRandom ? (
          <ShuffleIcon width={20} height={20} color={iconColor} />
        ) : (
          <CalendarIcon width={20} height={20} color={iconColor} />
        )}
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.button, styles.buttonSpacing]}
        onPress={onToggleView}
        accessibilityRole="button"
        accessibilityLabel={
          viewIsGallery
            ? 'Layout: two columns. Tap for one column'
            : 'Layout: one column. Tap for two columns'
        }
        accessibilityState={{ selected: true }}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        {viewIsGallery ? (
          <GridIcon width={20} height={20} color={iconColor} />
        ) : (
          <FeedIcon width={20} height={20} color={iconColor} />
        )}
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  button: {
    padding: SPACING.xs,
    borderRadius: 6,
  },
  buttonSpacing: {
    marginLeft: 8,
  },
});
