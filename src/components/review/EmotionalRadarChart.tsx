import React, { useMemo } from 'react';
import { View } from 'react-native';
import Svg, { Circle, G, Line, Path, Text as SvgText } from 'react-native-svg';
import type { AlignmentBaseline, TextAnchor } from 'react-native-svg';

export interface EmotionalRadarAxisDatum {
  key: string;
  label: string;
  value: number; // 0..100
  rawCount: number;
}

interface EmotionalRadarChartProps {
  width: number;
  height: number;
  axes: EmotionalRadarAxisDatum[];
  colors: {
    axis: string;
    grid: string;
    label: string;
    polygonStroke: string;
    polygonFill: string;
    point: string;
  };
}

type Point = { x: number; y: number };

const SAFE_SMOOTHING_TENSION = 0.18;
const MAX_CONTROL_MULTIPLIER = 0.6;

function isFinitePoint(p: Point): boolean {
  return Number.isFinite(p.x) && Number.isFinite(p.y);
}

function pointDistance(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function clampControl(anchor: Point, control: Point, maxDistance: number): Point {
  if (!isFinitePoint(anchor) || !isFinitePoint(control) || !Number.isFinite(maxDistance) || maxDistance <= 0) {
    return anchor;
  }
  const dx = control.x - anchor.x;
  const dy = control.y - anchor.y;
  const dist = Math.hypot(dx, dy);
  if (!Number.isFinite(dist) || dist <= maxDistance) return control;
  const scale = maxDistance / dist;
  return { x: anchor.x + dx * scale, y: anchor.y + dy * scale };
}

function toLinearClosedPath(points: Point[]): string {
  if (points.length === 0) return '';
  const start = points[0];
  const rest = points.slice(1).map((pt) => `L ${pt.x} ${pt.y}`).join(' ');
  return `M ${start.x} ${start.y} ${rest} Z`;
}

/**
 * Closed Catmull-Rom style smoothing with conservative control-point clamps.
 * Falls back to linear closed polygon on degenerate/invalid geometry.
 */
function toSmoothClosedPath(points: Point[]): string {
  if (points.length < 3 || points.some((p) => !isFinitePoint(p))) {
    return toLinearClosedPath(points);
  }

  let d = `M ${points[0].x} ${points[0].y}`;
  const n = points.length;

  for (let i = 0; i < n; i++) {
    const p0 = points[(i - 1 + n) % n];
    const p1 = points[i];
    const p2 = points[(i + 1) % n];
    const p3 = points[(i + 2) % n];

    const segIn = pointDistance(p0, p1);
    const segOut = pointDistance(p1, p2);
    const segNext = pointDistance(p2, p3);
    const safeRange1 = Math.min(segIn, segOut) * MAX_CONTROL_MULTIPLIER;
    const safeRange2 = Math.min(segOut, segNext) * MAX_CONTROL_MULTIPLIER;

    let cp1: Point = {
      x: p1.x + (p2.x - p0.x) * SAFE_SMOOTHING_TENSION,
      y: p1.y + (p2.y - p0.y) * SAFE_SMOOTHING_TENSION,
    };
    let cp2: Point = {
      x: p2.x - (p3.x - p1.x) * SAFE_SMOOTHING_TENSION,
      y: p2.y - (p3.y - p1.y) * SAFE_SMOOTHING_TENSION,
    };

    cp1 = clampControl(p1, cp1, safeRange1);
    cp2 = clampControl(p2, cp2, safeRange2);

    if (!isFinitePoint(cp1) || !isFinitePoint(cp2) || !isFinitePoint(p2)) {
      return toLinearClosedPath(points);
    }

    d += ` C ${cp1.x} ${cp1.y} ${cp2.x} ${cp2.y} ${p2.x} ${p2.y}`;
  }

  return `${d} Z`;
}

const EmotionalRadarChart: React.FC<EmotionalRadarChartProps> = ({ width, height, axes, colors }) => {
  const axisLabelFontSize = 11 * 0.85;
  const cx = width / 2;
  const cy = height / 2;
  const radius = Math.max(12, Math.min(width, height) / 2 - 36);
  const levels = [0.25, 0.5, 0.75, 1];

  const geometry = useMemo(() => {
    const axisCount = Math.max(axes.length, 1);
    const step = (Math.PI * 2) / axisCount;
    const start = -Math.PI / 2;

    const axisVectors = axes.map((axis, idx) => {
      const angle = start + idx * step;
      return {
        axis,
        angle,
        unitX: Math.cos(angle),
        unitY: Math.sin(angle),
      };
    });

    const ringRadii = levels.map((level) => radius * level);

    const polygonPoints = axisVectors.map((v) => {
      const normalized = Math.max(0, Math.min(100, Number.isFinite(v.axis.value) ? v.axis.value : 0)) / 100;
      return {
        x: cx + v.unitX * radius * normalized,
        y: cy + v.unitY * radius * normalized,
      };
    });

    const axisLines = axisVectors.map((v) => ({
      x1: cx,
      y1: cy,
      x2: cx + v.unitX * radius,
      y2: cy + v.unitY * radius,
      labelX: cx + v.unitX * (radius + 18),
      labelY: cy + v.unitY * (radius + 18),
      labelAnchor: (v.unitX > 0.4 ? 'start' : v.unitX < -0.4 ? 'end' : 'middle') as TextAnchor,
      labelBaseline: (v.unitY > 0.35 ? 'hanging' : v.unitY < -0.35 ? 'baseline' : 'middle') as AlignmentBaseline,
      label: v.axis.label.toUpperCase(),
    }));

    return {
      axisLines,
      ringRadii,
      polygonPoints,
      polygonPath: toSmoothClosedPath(polygonPoints),
    };
  }, [axes, cx, cy, radius]);

  return (
    <View accessible accessibilityRole="image" accessibilityLabel="Emotional data radar chart">
      <Svg width={width} height={height}>
        <G>
          {geometry.ringRadii.map((r, idx) => (
            <Circle
              key={`grid-ring-${idx}`}
              cx={cx}
              cy={cy}
              r={r}
              stroke={colors.grid}
              strokeWidth={1}
              fill="none"
              opacity={idx === levels.length - 1 ? 0.35 : 0.2}
            />
          ))}
          {geometry.axisLines.map((line, idx) => (
            <Line key={`axis-${idx}`} x1={line.x1} y1={line.y1} x2={line.x2} y2={line.y2} stroke={colors.axis} strokeWidth={1} opacity={0.35} />
          ))}
          {geometry.polygonPath ? (
            <>
              <Path d={geometry.polygonPath} stroke={colors.polygonStroke} strokeWidth={3} fill={colors.polygonFill} />
              {geometry.polygonPoints.map((pt, idx) => (
                <Circle key={`pt-${idx}`} cx={pt.x} cy={pt.y} r={3} fill={colors.point} />
              ))}
            </>
          ) : null}
          {geometry.axisLines.map((line, idx) => (
            <SvgText
              key={`label-${idx}`}
              x={line.labelX}
              y={line.labelY}
              fontSize={axisLabelFontSize}
              fill={colors.label}
              fontWeight="600"
              textAnchor={line.labelAnchor}
              alignmentBaseline={line.labelBaseline}
            >
              {line.label}
            </SvgText>
          ))}
        </G>
      </Svg>
    </View>
  );
};

export default EmotionalRadarChart;
