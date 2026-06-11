/** Shared recap entrance / count-up timing (Wrapped-style, subtle). */
export const RECAP_ENTRANCE_MS = 280;
export const RECAP_STAGGER_MS = 90;
export const RECAP_COUNT_MS = 750;
export const RECAP_TITLE_OFFSET_Y = 8;
export const RECAP_CONTENT_BASE_DELAY_MS = 200;
export const RECAP_CHART_CLIP_MS = 1400;
export const RECAP_DOT_POP_STAGGER_MS = 80;

export function recapStaggerDelay(index: number, baseDelay = RECAP_CONTENT_BASE_DELAY_MS): number {
  return baseDelay + index * RECAP_STAGGER_MS;
}
