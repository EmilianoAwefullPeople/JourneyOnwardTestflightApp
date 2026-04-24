/**
 * Organic Mesh Design System
 * Source of truth for the Organic Mesh aesthetic: tactile, sophisticated, fluid.
 * Use these tokens and rules whenever implementing mesh backgrounds, buttons, or atmosphere.
 */

// ---------------------------------------------------------------------------
// 1. Visual DNA — Color Palette (exact hex values)
// ---------------------------------------------------------------------------

export const ORGANIC_MESH_COLORS = {
  /** Deep base — primary dark green */
  oliveLeaf: '#344f16',
  /** Mid-tone green */
  fern: '#487525',
  /** Highlight / light source — use as "light leak" with lower opacity */
  royalGold: '#fed86d',
  /** Soft blue-grey — atmospheric */
  paleSky: '#acc6d8',
  /** Atmospheric accent — use as "light leak" with lower opacity */
  babyBlue: '#8dc0e0',
  /** Structural depth — shadows, small text, borders */
  darkSlate: '#3e575f',
} as const;

/** RGBA helpers for layered gradients (e.g. 50% transparent stop for bleed) */
export const ORGANIC_MESH_RGBA = {
  oliveLeaf: (a: number) => `rgba(52, 79, 22, ${a})`,
  fern: (a: number) => `rgba(72, 117, 37, ${a})`,
  royalGold: (a: number) => `rgba(254, 216, 109, ${a})`,
  paleSky: (a: number) => `rgba(172, 198, 216, ${a})`,
  babyBlue: (a: number) => `rgba(141, 192, 224, ${a})`,
  darkSlate: (a: number) => `rgba(62, 87, 95, ${a})`,
} as const;

// ---------------------------------------------------------------------------
// 2. Mesh Gradient Logic — "No-Border" Rules
// ---------------------------------------------------------------------------

/**
 * Radial expansion: Colors transition by radius, not angle.
 * In React Native (no native radial-gradient): simulate with overlapping
 * LinearGradient layers at different start/end points and use locations
 * with at least one stop at 0.5+ transparency so colors bleed.
 *
 * Luminance hierarchy: Place royalGold and babyBlue on TOP layers with
 * lower opacity (e.g. 0.2–0.4) to act as "light leaks."
 *
 * Grain texture: All mesh surfaces should include a subtle noise overlay.
 * - Web/CSS: feTurbulence SVG filter or repeating 3% opacity grain PNG.
 * - React Native: Use GrainOverlay (SVG feTurbulence) or a tiled grain
 *   image at ~3% opacity for a physical feel.
 */

// ---------------------------------------------------------------------------
// 3. Component Integration Rules
// ---------------------------------------------------------------------------

/**
 * Text & titles:
 * - Use background-clip: text (or equivalent) for mesh text; limit to 2–3
 *   colors in the letterforms. Small body text: use darkSlate for legibility.
 *
 * Buttons & interactives:
 * - Mesh as background material. On hover/press: shift background-position
 *   or scale of gradients (fluid movement), not a flat color change.
 *
 * Borders:
 * - No solid strokes. Use border-image or pseudo-elements with mesh colors
 *   for soft, glowing edges.
 *
 * Atmosphere:
 * - Shadows: long and colored (darkSlate with high transparency), not pure black.
 */

// ---------------------------------------------------------------------------
// 4. React Native usage
// ---------------------------------------------------------------------------

/**
 * Backgrounds: Layer multiple <LinearGradient> (expo-linear-gradient)
 * with different start/end to simulate radial expansion. Use ORGANIC_MESH_COLORS
 * and ORGANIC_MESH_RGBA for base + transparent stops (e.g. [color, 'transparent']
 * at locations [0, 0.6]).
 *
 * Grain: Add a full-screen overlay — either a GrainOverlay component using
 * react-native-svg FeTurbulence (filter + rect) at low opacity, or a static
 * grain image with opacity ~0.03.
 *
 * Example layer order for a full-screen mesh:
 * 1. Base View with backgroundColor: oliveLeaf
 * 2. LinearGradient fern (e.g. center to edges, transparent at 50%+)
 * 3. LinearGradient paleSky (e.g. top-left, transparent at 60%+)
 * 4. LinearGradient babyBlue (light leak, opacity ~0.3)
 * 5. LinearGradient royalGold (light leak, e.g. top-right, opacity ~0.25)
 * 6. Optional darkSlate in corners for depth
 * 7. Grain overlay on top
 */

// ---------------------------------------------------------------------------
// 5. Loading screen mesh
// ---------------------------------------------------------------------------

/**
 * Loading screen background (Organic Mesh from zero):
 *
 * - No solid green base. The base is one or two full-screen LinearGradients
 *   (e.g. oliveLeaf, fern, paleSky) with locations so olive/fern/blue-grey
 *   are all visible — no single flat green block.
 *
 * - Light leaks must be clearly visible:
 *   - Royal-gold top-right: opacity 0.5–0.8 at source, then fade to transparent
 *     (e.g. locations [0, 0.35, 0.7]). start (1,0), end (0.1, 0.6).
 *   - Baby-blue / pale-sky top-left: opacity 0.5+ at source, then fade.
 *     start (0,0), end (0.6, 0.5).
 *
 * - Grain: Prefer SVG FeTurbulence overlay (react-native-svg) at ~0.04–0.06
 *   opacity where supported. Fallback: GrainOverlay component using a subtle
 *   semi-transparent overlay (e.g. white 0.03–0.04) so the mesh doesn't look
 *   flat and we avoid darkening.
 *
 * - Layer order: base gradient(s) → royal-gold → baby-blue/pale-sky →
 *   optional fern center / dark-slate depth → grain → content (title/subtitle).
 */

export default ORGANIC_MESH_COLORS;
