
import React from 'react';
import { Svg, Path, Rect } from 'react-native-svg';

interface CalendarIconProps {
    width?: number;
    height?: number;
    color?: string;
}

const CalendarIcon: React.FC<CalendarIconProps> = ({
    width = 14,
    height = 14,
    color = '#FFFFFF',
}) => {
    return (
        <Svg width={width} height={height} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <Rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
            <Path d="M16 2v4" />
            <Path d="M8 2v4" />
            <Path d="M3 10h18" />
        </Svg>
    );
};

export default CalendarIcon;
