// LiveAura
// Multi-chromatic animated aura effect using SVG filters and mesh gradients.
// Replaces standard box-shadow with a premium, organic "breathing" aura.

import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View, Easing, ViewStyle } from 'react-native';
import Svg, { Defs, RadialGradient, Stop, Rect, Filter, FeGaussianBlur, G } from 'react-native-svg';
import { ORGANIC_MESH_COLORS, ORGANIC_MESH_RGBA } from '../../config/organicMeshDesignSystem';
import GrainOverlay from './GrainOverlay';

interface LiveAuraProps {
    /** Style to apply to the container view */
    style?: ViewStyle;
    /** Whether the aura is active/visible */
    active?: boolean;
}

const AnimatedG = Animated.createAnimatedComponent(G);
const AnimatedSvg = Animated.createAnimatedComponent(Svg);

/**
 * LiveAura Component
 * Creates an animated "Mesh Shadow" using SVG Radial Gradients and Gaussian Blur.
 * The aura oscillates in scale and rotation to feel "alive".
 */
const LiveAura: React.FC<LiveAuraProps> = ({ style, active = true }) => {
    // Animation values for the "Aura Drift"
    const driftAnim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        if (active) {
            Animated.loop(
                Animated.timing(driftAnim, {
                    toValue: 1,
                    duration: 10000, // 10s duration for a slow, organic feel
                    easing: Easing.linear,
                    useNativeDriver: true,
                })
            ).start();
        } else {
            driftAnim.stopAnimation();
        }
    }, [active, driftAnim]);

    // Interpolate for aura drift (oscillating scale and subtle rotation)
    const scale = driftAnim.interpolate({
        inputRange: [0, 0.5, 1],
        outputRange: [1, 1.05, 1],
    });

    const rotate = driftAnim.interpolate({
        inputRange: [0, 0.5, 1],
        outputRange: ['0deg', '2deg', '0deg'],
    });

    if (!active) return null;

    return (
        <View style={[styles.container, style]} pointerEvents="none">
            <AnimatedSvg
                height="100%"
                width="100%"
                style={[
                    styles.svg,
                    {
                        transform: [{ scale }, { rotate }],
                    },
                ]}
                viewBox="0 0 100 100"
            >
                <Defs>
                    {/* Blur Filter for Diffusion */}
                    <Filter id="auraBlur" x="-50%" y="-50%" width="200%" height="200%">
                        <FeGaussianBlur stdDeviation="2" />
                    </Filter>

                    {/* Core Colors Gradients */}
                    {/* Baby Blue TL */}
                    <RadialGradient id="gradBlue" cx="20%" cy="20%" r="60%" fx="20%" fy="20%" gradientUnits="userSpaceOnUse">
                        <Stop offset="0%" stopColor={ORGANIC_MESH_COLORS.babyBlue} stopOpacity="0.6" />
                        <Stop offset="100%" stopColor={ORGANIC_MESH_COLORS.babyBlue} stopOpacity="0" />
                    </RadialGradient>

                    {/* Royal Gold TR */}
                    <RadialGradient id="gradGold" cx="80%" cy="20%" r="60%" fx="80%" fy="20%" gradientUnits="userSpaceOnUse">
                        <Stop offset="0%" stopColor={ORGANIC_MESH_COLORS.royalGold} stopOpacity="0.6" />
                        <Stop offset="100%" stopColor={ORGANIC_MESH_COLORS.royalGold} stopOpacity="0" />
                    </RadialGradient>

                    {/* Fern Base */}
                    <RadialGradient id="gradFern" cx="50%" cy="80%" r="70%" fx="50%" fy="80%" gradientUnits="userSpaceOnUse">
                        <Stop offset="0%" stopColor={ORGANIC_MESH_COLORS.fern} stopOpacity="0.5" />
                        <Stop offset="100%" stopColor={ORGANIC_MESH_COLORS.fern} stopOpacity="0" />
                    </RadialGradient>
                </Defs>

                {/* Layered Rects to create the Mesh Effect */}
                <G filter="url(#auraBlur)">
                    <Rect x="0" y="0" width="100" height="100" fill="url(#gradFern)" />
                    <Rect x="0" y="0" width="100" height="100" fill="url(#gradBlue)" />
                    <Rect x="0" y="0" width="100" height="100" fill="url(#gradGold)" />
                </G>
            </AnimatedSvg>

            {/* Foundational Grain Texture Overlay */}
            <GrainOverlay style={styles.grain} />
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        ...StyleSheet.absoluteFillObject,
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: -1, // Ensure it's behind the target container
        overflow: 'visible',
    },
    svg: {
        position: 'absolute',
        opacity: 0.6, // Diffusion opacity as per requirements
    },
    grain: {
        opacity: 0.03, // Subtle grain texture
        borderRadius: 20, // Should match or exceed target container radius
    },
});

export default LiveAura;
