import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Dimensions, Easing, StyleSheet, Text, View } from 'react-native';
import {
  Svg, Path, Circle, G, Defs, LinearGradient, Stop, Rect, ClipPath,
  Text as SvgText,
} from 'react-native-svg';
import { FONTS, FONT_WEIGHTS } from '../../../config/constants';
import { RECAP_SLIDE_H_MARGIN, recapSlideStyles } from '../recapSlideStyles';
import RecapAnimatedTitle from '../motion/RecapAnimatedTitle';
import { useRecapStaggerEntrance } from '../motion/useRecapStaggerEntrance';
import { useReduceMotion } from '../../../hooks/useReduceMotion';
import {
  RECAP_CHART_CLIP_MS,
  RECAP_DOT_POP_STAGGER_MS,
} from '../motion/recapMotionConfig';
import { pointsToSmoothCurvePath, pointsToSmoothAreaPath } from '../../../utils/chartSmoothPath';

let _AnimatedCircle: React.ComponentType<Record<string, unknown>> | null = null;
function getAnimatedCircle() {
  if (!_AnimatedCircle) _AnimatedCircle = Animated.createAnimatedComponent(Circle);
  return _AnimatedCircle;
}

const { width: SW, height: SH } = Dimensions.get('window');

const H_MARGIN = RECAP_SLIDE_H_MARGIN;
// Y-axis label column lives INSIDE the SVG at x < Y_AXIS_W.
// This keeps the SVG as the sole child of chartSection, with width = SW - H_MARGIN*2.
const Y_AXIS_W = 32;
const SVG_W = SW - H_MARGIN * 2;   // SVG fills the padded container exactly
const CHART_W = SVG_W - Y_AXIS_W;  // horizontal span from y-axis column to SVG right edge
// Inset so edge points + "13 MAY" labels (textAnchor middle) stay inside the SVG bounds
const PLOT_PAD_L = 6;
const PLOT_PAD_R = Math.min(34, Math.max(24, Math.round(CHART_W * 0.1)));
const PLOT_INNER_W = Math.max(1, CHART_W - PLOT_PAD_L - PLOT_PAD_R);
const PLOT_X0 = Y_AXIS_W + PLOT_PAD_L;
const PLOT_X1 = PLOT_X0 + PLOT_INNER_W;
const CLIP_REVEAL_W = PLOT_INNER_W + PLOT_PAD_L + 10;
const CHART_H = 200;
const X_AXIS_H = 22;                // height below CHART_H for x labels
const Y_GRID_LINES = 4;

const LINE_COLORS = ['#60A5FA', '#FBBF24', '#34D399'];

function interpolateColor(t: number): string {
  const seg = (LINE_COLORS.length - 1) * t;
  const i = Math.min(Math.floor(seg), LINE_COLORS.length - 2);
  const f = seg - i;
  const parse = (hex: string) => [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
  const c0 = parse(LINE_COLORS[i]);
  const c1 = parse(LINE_COLORS[i + 1]);
  return `rgb(${Math.round(c0[0] + (c1[0] - c0[0]) * f)},${Math.round(c0[1] + (c1[1] - c0[1]) * f)},${Math.round(c0[2] + (c1[2] - c0[2]) * f)})`;
}

// "15 MAY" — always unambiguous, even when multiple points share a month
function formatXLabel(iso: string): string {
  try {
    const d = new Date(iso + 'T12:00:00');
    const mon = d.toLocaleDateString('en-US', { month: 'short' }).toUpperCase();
    return `${d.getDate()} ${mon}`;
  } catch {
    return iso.slice(5);
  }
}

/**
 * Returns which indices should carry an x-axis label.
 *
 * Goal: ~4-5 labels regardless of data density, always including
 * the first and last point so the time span is always visible.
 *
 *  ≤5 pts   → every point
 *  6-30 pts → stride = round((n-1)/4), first + last always forced
 *  >30 pts  → same formula; labels remain sparse (~5 total)
 */
function plotXForIndex(i: number, n: number): number {
  if (n <= 1) return PLOT_X0 + PLOT_INNER_W / 2;
  return PLOT_X0 + (i / (n - 1)) * PLOT_INNER_W;
}

function xLabelAnchor(i: number, n: number): 'start' | 'middle' | 'end' {
  if (n <= 1) return 'middle';
  if (i === 0) return 'start';
  if (i === n - 1) return 'end';
  return 'middle';
}

function xLabelIndices(total: number): Set<number> {
  const set = new Set<number>();
  if (total === 0) return set;
  if (total <= 5) {
    for (let i = 0; i < total; i++) set.add(i);
    return set;
  }
  set.add(0);
  set.add(total - 1);
  const stride = Math.max(1, Math.round((total - 1) / 4));
  for (let i = stride; i < total - 1; i += stride) set.add(i);
  return set;
}

const AnimatedRect = Animated.createAnimatedComponent(Rect);

interface Props {
  data: Array<{ date: string; count: number }>;
  xAxisMode: 'days' | 'weeks';
}

const ActivityDistributionGraphSlide: React.FC<Props> = ({ data }) => {
  const reduceMotion = useReduceMotion();
  const clipAnim = useRef(new Animated.Value(reduceMotion ? CLIP_REVEAL_W : 0)).current;
  const chartSectionEntrance = useRecapStaggerEntrance({ index: 0, baseDelay: 180 });
  const AnimatedCircle = getAnimatedCircle();

  useEffect(() => {
    if (reduceMotion) {
      clipAnim.setValue(CLIP_REVEAL_W);
      return;
    }
    clipAnim.setValue(0);
    Animated.timing(clipAnim, {
      toValue: CLIP_REVEAL_W,
      duration: RECAP_CHART_CLIP_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [clipAnim, reduceMotion]);

  const { points, yTicks, topVal } = useMemo(() => {
    const maxVal = Math.max(...data.map((d) => d.count), 1);
    const nice = Math.ceil(maxVal / 5) * 5;
    const step = Math.max(1, Math.ceil(nice / Y_GRID_LINES));
    const yTicks = Array.from({ length: Y_GRID_LINES + 1 }, (_, i) => i * step);
    const topVal = yTicks[yTicks.length - 1];
    const n = data.length;
    const points = data.map((d, i) => ({
      x: plotXForIndex(i, n),
      y: CHART_H - (d.count / topVal) * CHART_H,
      t: n > 1 ? i / (n - 1) : 0.5,
    }));
    return { points, yTicks, topVal };
  }, [data]);

  const chartPoints = points.map((p) => ({ x: p.x, y: p.y }));
  const linePath = pointsToSmoothCurvePath(chartPoints);
  const areaPath = pointsToSmoothAreaPath(chartPoints, CHART_H);
  const labelIndices = useMemo(() => xLabelIndices(data.length), [data.length]);

  const dotScales = useMemo(
    () => points.map(() => new Animated.Value(reduceMotion ? 1 : 0)),
    [data.length, reduceMotion, points.length]
  );

  useEffect(() => {
    if (reduceMotion) {
      dotScales.forEach((a) => a.setValue(1));
      return;
    }
    dotScales.forEach((a) => a.setValue(0));
    const anims = points.map((_, i) =>
      Animated.timing(dotScales[i], {
        toValue: 1,
        duration: 220,
        delay: RECAP_CHART_CLIP_MS + i * RECAP_DOT_POP_STAGGER_MS,
        easing: Easing.out(Easing.back(1.4)),
        useNativeDriver: false,
      })
    );
    Animated.parallel(anims).start();
  }, [data.length, dotScales, points.length, reduceMotion]);

  return (
    <View style={styles.container}>
      <RecapAnimatedTitle>
        If documenting was a sport{'\n'}You'd be a pro athlete
      </RecapAnimatedTitle>

      <Animated.View style={[styles.chartSection, chartSectionEntrance.style]}>
        <Text style={styles.sectionLabel}>Memories &amp; journaling over time</Text>

        {/*
          Single SVG fills the padded container exactly.
          width = SVG_W = SW - H_MARGIN*2
          Y-axis labels live inside at x < Y_AXIS_W (no separate View needed).
        */}
        <Svg width={SVG_W} height={CHART_H + X_AXIS_H}>
          <Defs>
            <LinearGradient
              id="lineGrad"
              x1={PLOT_X0} y1="0" x2={PLOT_X1} y2="0"
              gradientUnits="userSpaceOnUse"
            >
              <Stop offset="0" stopColor={LINE_COLORS[0]} stopOpacity="1" />
              <Stop offset="0.5" stopColor={LINE_COLORS[1]} stopOpacity="1" />
              <Stop offset="1" stopColor={LINE_COLORS[2]} stopOpacity="1" />
            </LinearGradient>
            <LinearGradient
              id="areaGrad"
              x1="0" y1="0" x2="0" y2={CHART_H}
              gradientUnits="userSpaceOnUse"
            >
              <Stop offset="0" stopColor="#60A5FA" stopOpacity="0.18" />
              <Stop offset="1" stopColor="#141212" stopOpacity="0" />
            </LinearGradient>
            {/* Clip rect grows from the y-axis rightward */}
            <ClipPath id="chartReveal">
              <AnimatedRect x={Y_AXIS_W} y={-10} width={clipAnim} height={CHART_H + 20} />
            </ClipPath>
          </Defs>

          {/* Y-axis labels — inside SVG, right-aligned before the chart area */}
          {[...yTicks].reverse().map((val) => {
            const y = CHART_H - (val / topVal) * CHART_H;
            return (
              <SvgText
                key={val}
                x={Y_AXIS_W - 5}
                y={y + 4}
                textAnchor="end"
                fontSize="10"
                fill="rgba(255,255,255,0.4)"
                fontFamily={FONTS.inter}
              >
                {val}
              </SvgText>
            );
          })}

          {/* Horizontal grid lines — visible immediately */}
          {yTicks.map((val) => {
            const y = CHART_H - (val / topVal) * CHART_H;
            return (
              <Path
                key={`grid-${val}`}
                d={`M ${Y_AXIS_W} ${y} L ${PLOT_X1} ${y}`}
                stroke="rgba(255,255,255,0.08)"
                strokeWidth="1"
              />
            );
          })}

          {/* Chart content — revealed left→right by clip-path */}
          <G clipPath="url(#chartReveal)">
            {areaPath ? <Path d={areaPath} fill="url(#areaGrad)" /> : null}
            {linePath ? (
              <Path
                d={linePath}
                stroke="url(#lineGrad)"
                strokeWidth="2.5"
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : null}
          </G>

          {points.map((p, i) => {
            const r = dotScales[i].interpolate({
              inputRange: [0, 1],
              outputRange: [0, 4],
            });
            return (
              <AnimatedCircle
                key={`dot-${i}`}
                cx={p.x}
                cy={p.y}
                r={r}
                fill={interpolateColor(p.t)}
                stroke="#141212"
                strokeWidth={1.5}
              />
            );
          })}

          {/* X-axis labels — sparse; first/last use start/end anchor to avoid SVG clip */}
          {points.map((p, i) =>
            labelIndices.has(i) ? (
              <SvgText
                key={`xl-${i}`}
                x={p.x}
                y={CHART_H + X_AXIS_H - 4}
                textAnchor={xLabelAnchor(i, data.length)}
                fontSize="10"
                fill="rgba(255,255,255,0.45)"
                fontFamily={FONTS.inter}
              >
                {formatXLabel(data[i].date)}
              </SvgText>
            ) : null
          )}
        </Svg>
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    ...recapSlideStyles.screenWithTopInset,
  },
  chartSection: {
    paddingHorizontal: H_MARGIN,
  },
  sectionLabel: {
    fontFamily: FONTS.inter,
    fontSize: 14,
    fontWeight: FONT_WEIGHTS.semibold,
    color: '#FFFFFF',
    marginBottom: 16,
    marginLeft: Y_AXIS_W,
  },
});

export default ActivityDistributionGraphSlide;
