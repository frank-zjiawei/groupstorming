/**
 * Single source of truth for contributor colors.
 * Both bubble fills and Tailwind text classes index into the SAME sorted
 * contributor list, so the same person appears in the same color across:
 *   - bubble fills (LiveBubbles)
 *   - sidebar contributor list dots
 *   - canvas filter dropdown dots
 *   - transcript message author labels
 */

// Soft, low-saturation pastels matching the Groupsorming logo gradient.
// Lighter base colors keep the multiply blend mode from creating muddy / dark
// overlaps when bubble clouds intersect on the canvas.
export const BUBBLE_PALETTE = [
  '#cfdcd2', // soft sage (less bright than the old mint)
  '#c8d6e6', // pale dusty blue
  '#e6cfdb', // lavender-pink (no more aggressive rose)
  '#f0e0c8', // light peach
  '#e0d2ec', // soft lavender
  '#d8dce2', // pale silver-gray
  '#f0eccd', // light butter yellow
  '#dcc8dc', // gentle mauve
];

// Tailwind text class palette, aligned by INDEX with BUBBLE_PALETTE.
// Slightly muted hues (500 series) so transcript text doesn't shout.
export const TEXT_PALETTE = [
  'text-emerald-500',  // sage
  'text-blue-500',     // dusty blue
  'text-pink-500',     // lavender-pink
  'text-amber-600',    // peach
  'text-violet-500',   // lavender
  'text-slate-500',    // silver
  'text-yellow-600',   // butter yellow
  'text-fuchsia-500',  // mauve
];

// Special color slots (not part of the rotating palette)
export const AI_BUBBLE_COLOR = '#dde2e8';   // light cool gray for AI suggestions
export const AI_TEXT_COLOR = 'text-slate-500';
export const DISTILLED_BUBBLE_COLOR = '#f5e6c4'; // soft amber for consolidated themes
export const DISTILLED_TEXT_COLOR = 'text-amber-700';

/**
 * Stable index for a contributor based on a sorted list of all known names.
 * Uses sorted-index when available (deterministic, distinct), falls back to
 * hash for unknown authors.
 */
export function colorIndexFor(name: string, sortedContributors: string[]): number {
  const idx = sortedContributors.indexOf(name);
  if (idx >= 0) return idx % BUBBLE_PALETTE.length;
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return Math.abs(hash) % BUBBLE_PALETTE.length;
}

export function isAIAuthor(name: string): boolean {
  return name.includes('AI') || name === 'unknown';
}

export function isDistilledAuthor(name: string): boolean {
  return name === 'Distilled';
}
