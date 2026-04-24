// Emotion Utils
// Mood wheel and step-2 emotion sets (no valence/arousal)

export interface EmotionSuggestion {
  label: string;
  emoji: string;
  color: string;
}

// --- Mood wheel (color wheel) mapping: angle (0-360) to mood label ---

const DEFAULT_MOOD = { label: 'Happy', hue: 128 };

/** Emotion-wheel key colors (reference wheel: Happy=orange, Sad=blue, Angry=red, Fearful=magenta, etc.). Angles in degrees, 0 = right. */
const WHEEL_COLOR_STOPS: { angle: number; hex: string }[] = [
  { angle: 0, hex: '#C0392B' },    // Angry - red
  { angle: 45, hex: '#E67E22' },   // Frustrated → orange
  { angle: 75, hex: '#F1C40F' },   // Optimistic - orange/yellow
  { angle: 105, hex: '#FED86D' },   // Happy - yellow
  { angle: 135, hex: '#7DCE82' },   // Content - yellow-green
  { angle: 165, hex: '#27AE60' },   // Calm - green
  { angle: 210, hex: '#3498DB' },   // Peaceful - blue
  { angle: 255, hex: '#2980B9' },   // Sad - dark blue
  { angle: 290, hex: '#9B59B6' },   // Thoughtful - purple
  { angle: 330, hex: '#8E44AD' },   // Anxious - magenta
  { angle: 360, hex: '#C0392B' },   // wrap to red
];

const DEFAULT_WHEEL_COLOR = '#7F8C8D';

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? { r: parseInt(result[1], 16), g: parseInt(result[2], 16), b: parseInt(result[3], 16) }
    : { r: 127, g: 140, b: 141 };
}

function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (n: number) => Math.round(Math.max(0, Math.min(255, n)));
  return '#' + [r, g, b].map((c) => ('0' + clamp(c).toString(16)).slice(-2)).join('');
}

/**
 * Interpolate wheel color at angle using emotion-wheel palette. Clamps angle; returns default on invalid input.
 */
export function getWheelColorAtAngle(angleDeg: number): string {
  const clamped = Math.max(0, Math.min(360, Number(angleDeg)));
  if (Number.isNaN(clamped)) return DEFAULT_WHEEL_COLOR;
  let i = 0;
  while (i < WHEEL_COLOR_STOPS.length - 1 && WHEEL_COLOR_STOPS[i + 1].angle < clamped) i++;
  const a = WHEEL_COLOR_STOPS[i];
  const b = WHEEL_COLOR_STOPS[i + 1];
  if (!b || a.angle === b.angle) return a.hex;
  const t = (clamped - a.angle) / (b.angle - a.angle);
  const r1 = hexToRgb(a.hex), r2 = hexToRgb(b.hex);
  return rgbToHex(
    r1.r + (r2.r - r1.r) * t,
    r1.g + (r2.g - r1.g) * t,
    r1.b + (r2.b - r1.b) * t
  );
}

/** Bright yellow for positive moods (Figma); white/royalGold for others. */
export function getMoodLabelColor(moodLabel: string): string {
  const positive = ['Happy', 'Surprised'];
  return positive.includes(moodLabel) ? '#FED86D' : '#FFFFFF';
}

/** Mood buckets: [angleStart, angleEnd), label. Angles in degrees, 0 = right (red). 
 * Aligned with Feelings Wheel 7 core emotions: Angry, Disgusted, Happy, Surprised, Sad, Fearful, Bad
 */
const MOOD_BUCKETS: { start: number; end: number; label: string; hue: number }[] = [
  { start: 0, end: 51, label: 'Angry', hue: 0 },          // Red sector
  { start: 51, end: 103, label: 'Disgusted', hue: 40 },   // Orange sector
  { start: 103, end: 154, label: 'Happy', hue: 128 },     // Yellow sector
  { start: 154, end: 206, label: 'Surprised', hue: 180 }, // Green sector
  { start: 206, end: 257, label: 'Sad', hue: 235 },       // Blue sector
  { start: 257, end: 309, label: 'Fearful', hue: 280 },   // Purple sector
  { start: 309, end: 360, label: 'Bad', hue: 330 },       // Magenta/pink sector
];

/**
 * Map wheel angle (0-360°) to mood label and hue. Clamps angle; returns default if out of range.
 */
export function getMoodFromAngle(angleDeg: number): { label: string; hue: number } {
  const clamped = Math.max(0, Math.min(360, Number(angleDeg)));
  if (Number.isNaN(clamped)) return DEFAULT_MOOD;
  const bucket = MOOD_BUCKETS.find(b => clamped >= b.start && clamped < b.end);
  return bucket ? { label: bucket.label, hue: bucket.hue } : DEFAULT_MOOD;
}

/**
 * Return the center angle (in [0, 360)) of the mood bucket containing angleDeg, for snap-to-mood.
 * If angle is not in any bucket (e.g. exactly 360), returns the closest bucket center.
 */
export function getNearestMoodBucketCenter(angleDeg: number): number {
  const clamped = Math.max(0, Math.min(360, Number(angleDeg)));
  if (Number.isNaN(clamped)) return (MOOD_BUCKETS[0].start + MOOD_BUCKETS[0].end) / 2;
  const bucket = MOOD_BUCKETS.find(b => clamped >= b.start && clamped < b.end);
  if (bucket) return (bucket.start + bucket.end) / 2;
  const centers = MOOD_BUCKETS.map(b => (b.start + b.end) / 2);
  const minAngleDist = (a: number, b: number) => {
    const d = Math.abs(a - b);
    return Math.min(d, 360 - d);
  };
  let best = centers[0];
  let bestDist = minAngleDist(centers[0], clamped);
  for (let i = 1; i < centers.length; i++) {
    const d = minAngleDist(centers[i], clamped);
    if (d < bestDist) {
      bestDist = d;
      best = centers[i];
    }
  }
  return best;
}

/**
 * Nine emotions for emotion capture (Figma 708-1261). Grid order: row 1–3, left to right.
 * Used by EmotionalCaptureFlow step 1 (3x3 grid).
 */
export const EMOTION_CAPTURE_OPTIONS: EmotionSuggestion[] = [
  { label: 'Happy', emoji: '😁', color: '#FED86D' },
  { label: 'Amazed', emoji: '🤩', color: '#FED86D' },
  { label: 'Easy', emoji: '😌', color: '#00CED1' },
  { label: 'Curious', emoji: '🤔', color: '#9B59B6' },
  { label: 'Loving', emoji: '🥰', color: '#EC4899' },
  { label: 'Nervous', emoji: '😬', color: '#8B5CF6' },
  { label: 'Sad', emoji: '😔', color: '#6495ED' },
  { label: 'Stressed', emoji: '😫', color: '#E67E22' },
  { label: 'Angry', emoji: '😠', color: '#DC2626' },
];

/**
 * Return emoji for an emotion label (for entry detail display). Checks EMOTION_CAPTURE_OPTIONS first, then step-2 sets; fallback "✨".
 */
export function getEmojiForEmotionLabel(label: string): string {
  if (!label?.trim()) return '✨';
  const key = label.trim();
  const fromCapture = EMOTION_CAPTURE_OPTIONS.find((e) => e.label.toLowerCase() === key.toLowerCase());
  if (fromCapture) return fromCapture.emoji;
  for (const arr of Object.values(SPECIFIC_EMOTIONS_BY_MOOD)) {
    const found = arr.find((e) => e.label.toLowerCase() === key.toLowerCase());
    if (found) return found.emoji;
  }
  return '✨';
}

/** Per-mood sets of 10 specific emotions for step 2 (Figma: Happy set). */
const SPECIFIC_EMOTIONS_BY_MOOD: Record<string, EmotionSuggestion[]> = {
  Happy: [
    { label: 'Happy', emoji: '😊', color: '#FED86D' },
    { label: 'Fulfilled', emoji: '🤩', color: '#FED86D' },
    { label: 'Joyful', emoji: '🥳', color: '#FED86D' },
    { label: 'Optimistic', emoji: '😀', color: '#FED86D' },
    { label: 'Content', emoji: '😌', color: '#FED86D' },
    { label: 'Peaceful', emoji: '😊', color: '#FED86D' },
    { label: 'Proud', emoji: '🤩', color: '#FED86D' },
    { label: 'Inspired', emoji: '😀', color: '#FED86D' },
    { label: 'Hopeful', emoji: '😌', color: '#FED86D' },
    { label: 'Cheerful', emoji: '😄', color: '#FED86D' },
  ],
  Content: [
    { label: 'Content', emoji: '😌', color: '#90EE90' },
    { label: 'Satisfied', emoji: '😊', color: '#90EE90' },
    { label: 'Peaceful', emoji: '😇', color: '#90EE90' },
    { label: 'Calm', emoji: '😌', color: '#90EE90' },
    { label: 'Grateful', emoji: '🙏', color: '#90EE90' },
    { label: 'Serene', emoji: '😊', color: '#90EE90' },
    { label: 'Relaxed', emoji: '😎', color: '#90EE90' },
    { label: 'Comfortable', emoji: '🙂', color: '#90EE90' },
    { label: 'At ease', emoji: '😌', color: '#90EE90' },
    { label: 'Pleased', emoji: '😊', color: '#90EE90' },
  ],
  Calm: [
    { label: 'Calm', emoji: '😌', color: '#00CED1' },
    { label: 'Relaxed', emoji: '😊', color: '#00CED1' },
    { label: 'Peaceful', emoji: '😇', color: '#00CED1' },
    { label: 'Serene', emoji: '😌', color: '#00CED1' },
    { label: 'Tranquil', emoji: '😊', color: '#00CED1' },
    { label: 'Composed', emoji: '🙂', color: '#00CED1' },
    { label: 'Balanced', emoji: '⚖️', color: '#00CED1' },
    { label: 'Grounded', emoji: '🌿', color: '#00CED1' },
    { label: 'Centered', emoji: '🧘', color: '#00CED1' },
    { label: 'Still', emoji: '🌊', color: '#00CED1' },
  ],
  Peaceful: [
    { label: 'Peaceful', emoji: '😇', color: '#87CEEB' },
    { label: 'Serene', emoji: '😌', color: '#87CEEB' },
    { label: 'Tranquil', emoji: '😊', color: '#87CEEB' },
    { label: 'Calm', emoji: '😌', color: '#87CEEB' },
    { label: 'Gentle', emoji: '🌸', color: '#87CEEB' },
    { label: 'Soothing', emoji: '🌙', color: '#87CEEB' },
    { label: 'Quiet', emoji: '🤫', color: '#87CEEB' },
    { label: 'Restful', emoji: '😴', color: '#87CEEB' },
    { label: 'At peace', emoji: '😊', color: '#87CEEB' },
    { label: 'Placid', emoji: '😌', color: '#87CEEB' },
  ],
  Sad: [
    { label: 'Sad', emoji: '😢', color: '#6495ED' },
    { label: 'Melancholic', emoji: '😔', color: '#6495ED' },
    { label: 'Down', emoji: '😞', color: '#6495ED' },
    { label: 'Lonely', emoji: '😢', color: '#6495ED' },
    { label: 'Grieving', emoji: '😭', color: '#6495ED' },
    { label: 'Blue', emoji: '😔', color: '#6495ED' },
    { label: 'Heavy', emoji: '😞', color: '#6495ED' },
    { label: 'Disappointed', emoji: '😕', color: '#6495ED' },
    { label: 'Sorrowful', emoji: '😢', color: '#6495ED' },
    { label: 'Miserable', emoji: '😢', color: '#6495ED' },
  ],
  Angry: [
    { label: 'Angry', emoji: '😠', color: '#DC2626' },
    { label: 'Frustrated', emoji: '😤', color: '#DC2626' },
    { label: 'Irritated', emoji: '😡', color: '#DC2626' },
    { label: 'Furious', emoji: '🤬', color: '#DC2626' },
    { label: 'Annoyed', emoji: '😤', color: '#DC2626' },
    { label: 'Upset', emoji: '😠', color: '#DC2626' },
    { label: 'Agitated', emoji: '😡', color: '#DC2626' },
    { label: 'Resentful', emoji: '😒', color: '#DC2626' },
    { label: 'Outraged', emoji: '😠', color: '#DC2626' },
    { label: 'Indignant', emoji: '😤', color: '#DC2626' },
  ],
  Disgusted: [
    { label: 'Disgusted', emoji: '🤢', color: '#E67E22' },
    { label: 'Repulsed', emoji: '😖', color: '#E67E22' },
    { label: 'Revolted', emoji: '🤮', color: '#E67E22' },
    { label: 'Appalled', emoji: '😧', color: '#E67E22' },
    { label: 'Nauseated', emoji: '🤢', color: '#E67E22' },
    { label: 'Turned off', emoji: '😣', color: '#E67E22' },
    { label: 'Averse', emoji: '😒', color: '#E67E22' },
    { label: 'Uncomfortable', emoji: '😖', color: '#E67E22' },
    { label: 'Offended', emoji: '😠', color: '#E67E22' },
    { label: 'Repelled', emoji: '🤢', color: '#E67E22' },
  ],
  Surprised: [
    { label: 'Surprised', emoji: '😮', color: '#7DCE82' },
    { label: 'Amazed', emoji: '😲', color: '#7DCE82' },
    { label: 'Astonished', emoji: '😯', color: '#7DCE82' },
    { label: 'Shocked', emoji: '😳', color: '#7DCE82' },
    { label: 'Startled', emoji: '😦', color: '#7DCE82' },
    { label: 'Stunned', emoji: '🤯', color: '#7DCE82' },
    { label: 'Bewildered', emoji: '😵', color: '#7DCE82' },
    { label: 'Curious', emoji: '🤔', color: '#7DCE82' },
    { label: 'Intrigued', emoji: '🧐', color: '#7DCE82' },
    { label: 'Confused', emoji: '😕', color: '#7DCE82' },
  ],
  Fearful: [
    { label: 'Fearful', emoji: '😨', color: '#9B59B6' },
    { label: 'Scared', emoji: '😱', color: '#9B59B6' },
    { label: 'Afraid', emoji: '😰', color: '#9B59B6' },
    { label: 'Terrified', emoji: '😱', color: '#9B59B6' },
    { label: 'Anxious', emoji: '😰', color: '#9B59B6' },
    { label: 'Worried', emoji: '😟', color: '#9B59B6' },
    { label: 'Nervous', emoji: '😬', color: '#9B59B6' },
    { label: 'Panicked', emoji: '😨', color: '#9B59B6' },
    { label: 'Alarmed', emoji: '😦', color: '#9B59B6' },
    { label: 'Vulnerable', emoji: '😔', color: '#9B59B6' },
  ],
  Bad: [
    { label: 'Bad', emoji: '😞', color: '#EC4899' },
    { label: 'Uncomfortable', emoji: '😣', color: '#EC4899' },
    { label: 'Unwell', emoji: '🤒', color: '#EC4899' },
    { label: 'Troubled', emoji: '😔', color: '#EC4899' },
    { label: 'Distressed', emoji: '😩', color: '#EC4899' },
    { label: 'Hurt', emoji: '😢', color: '#EC4899' },
    { label: 'Guilty', emoji: '😓', color: '#EC4899' },
    { label: 'Ashamed', emoji: '😳', color: '#EC4899' },
    { label: 'Regretful', emoji: '😔', color: '#EC4899' },
    { label: 'Embarrassed', emoji: '😳', color: '#EC4899' },
  ],
  Frustrated: [
    { label: 'Frustrated', emoji: '😤', color: '#E07C3C' },
    { label: 'Stuck', emoji: '😣', color: '#E07C3C' },
    { label: 'Impatient', emoji: '😤', color: '#E07C3C' },
    { label: 'Annoyed', emoji: '😒', color: '#E07C3C' },
    { label: 'Restless', emoji: '😩', color: '#E07C3C' },
    { label: 'Agitated', emoji: '😠', color: '#E07C3C' },
    { label: 'Irritated', emoji: '😡', color: '#E07C3C' },
    { label: 'Fed up', emoji: '😤', color: '#E07C3C' },
    { label: 'Overwhelmed', emoji: '😫', color: '#E07C3C' },
    { label: 'Exasperated', emoji: '😤', color: '#E07C3C' },
  ],
  Optimistic: [
    { label: 'Optimistic', emoji: '😀', color: '#FED86D' },
    { label: 'Hopeful', emoji: '😌', color: '#FED86D' },
    { label: 'Excited', emoji: '😃', color: '#FED86D' },
    { label: 'Eager', emoji: '😆', color: '#FED86D' },
    { label: 'Enthusiastic', emoji: '🤩', color: '#FED86D' },
    { label: 'Positive', emoji: '😊', color: '#FED86D' },
    { label: 'Confident', emoji: '💪', color: '#FED86D' },
    { label: 'Motivated', emoji: '🔥', color: '#FED86D' },
    { label: 'Inspired', emoji: '✨', color: '#FED86D' },
    { label: 'Upbeat', emoji: '😄', color: '#FED86D' },
  ],
  Thoughtful: [
    { label: 'Thoughtful', emoji: '🤔', color: '#9B59B6' },
    { label: 'Reflective', emoji: '🧐', color: '#9B59B6' },
    { label: 'Contemplative', emoji: '💭', color: '#9B59B6' },
    { label: 'Curious', emoji: '🤔', color: '#9B59B6' },
    { label: 'Introspective', emoji: '👁️', color: '#9B59B6' },
    { label: 'Pensive', emoji: '😌', color: '#9B59B6' },
    { label: 'Wondering', emoji: '💫', color: '#9B59B6' },
    { label: 'Mindful', emoji: '🧘', color: '#9B59B6' },
    { label: 'Meditative', emoji: '😇', color: '#9B59B6' },
    { label: 'Considering', emoji: '🤔', color: '#9B59B6' },
  ],
  Anxious: [
    { label: 'Anxious', emoji: '😰', color: '#8B5CF6' },
    { label: 'Worried', emoji: '😟', color: '#8B5CF6' },
    { label: 'Nervous', emoji: '😬', color: '#8B5CF6' },
    { label: 'Uneasy', emoji: '😣', color: '#8B5CF6' },
    { label: 'Stressed', emoji: '😫', color: '#8B5CF6' },
    { label: 'Tense', emoji: '😬', color: '#8B5CF6' },
    { label: 'Apprehensive', emoji: '😨', color: '#8B5CF6' },
    { label: 'On edge', emoji: '😟', color: '#8B5CF6' },
    { label: 'Restless', emoji: '😩', color: '#8B5CF6' },
    { label: 'Jittery', emoji: '😣', color: '#8B5CF6' },
  ],
};

/**
 * Return the 10 specific emotions for step 2 for a given mood. Falls back to Happy set if mood unknown.
 */
export function getSpecificEmotionsForMood(moodLabel: string): EmotionSuggestion[] {
  const key = moodLabel?.trim() || '';
  const set = SPECIFIC_EMOTIONS_BY_MOOD[key] ?? SPECIFIC_EMOTIONS_BY_MOOD.Happy;
  return set.slice(0, 10);
}
