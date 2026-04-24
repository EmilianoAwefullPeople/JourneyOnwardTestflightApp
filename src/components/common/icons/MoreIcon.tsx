
import React from 'react';
import { Svg, Circle } from 'react-native-svg';

interface MoreIconProps {
    width?: number;
    height?: number;
    color?: string;
}

const MoreIcon: React.FC<MoreIconProps> = ({
    width = 24,
    height = 24,
    color = '#FFFFFF',
}) => {
    return (
        <Svg width={width} height={height} viewBox="0 0 24 24" fill="none">
            <Circle cx="12" cy="12" r="1" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            <Circle cx="19" cy="12" r="1" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            <Circle cx="5" cy="12" r="1" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
    );
};

export default MoreIcon;
