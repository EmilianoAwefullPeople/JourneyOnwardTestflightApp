import React from 'react';
import { Animated, type StyleProp, type ViewStyle } from 'react-native';
import { useRecapStaggerEntrance } from './useRecapStaggerEntrance';

interface Props {
  index: number;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

/** Staggered fade-in wrapper for recap choice buttons / list rows. */
const RecapChoiceRow: React.FC<Props> = ({ index, children, style }) => {
  const { style: entranceStyle } = useRecapStaggerEntrance({ index, offsetY: 14 });
  return <Animated.View style={[style, entranceStyle]}>{children}</Animated.View>;
};

export default RecapChoiceRow;
