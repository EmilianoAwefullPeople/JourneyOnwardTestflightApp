
import React from 'react';
import { Text, TextStyle, StyleProp, View } from 'react-native';
import MaskedView from '@react-native-masked-view/masked-view';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS } from '../../config/constants';

interface GradientTextProps {
    colors?: string[];
    style?: StyleProp<TextStyle>;
    children: React.ReactNode;
    start?: { x: number; y: number };
    end?: { x: number; y: number };
}

const GradientText: React.FC<GradientTextProps> = ({
    colors = [COLORS.babyBlue, COLORS.royalGold, COLORS.fern],
    style,
    children,
    start = { x: 0, y: 0 },
    end = { x: 1, y: 0 },
}) => {
    return (
        <MaskedView
            maskElement={
                <Text maxFontSizeMultiplier={1.5} style={[style, { backgroundColor: 'transparent' }]}>
                    {children}
                </Text>
            }
        >
            <LinearGradient
                colors={colors as any}
                start={start}
                end={end}
            >
                <Text maxFontSizeMultiplier={1.5} style={[style, { opacity: 0 }]}>
                    {children}
                </Text>
            </LinearGradient>
        </MaskedView>
    );
};

export default GradientText;
