/** Smallest level change (0…1) worth redrawing a glow and swell: below it, the eye can't tell. */
export const LEVEL_STEP = 0.05;

/**
 * Level to write on an element showing `shown` (undefined: nothing written yet), or `undefined`
 * to leave it as is: small wobbles of a steady sound are ignored, but silence always ends at 0.
 */
export function nextLevel(shown: number | undefined, level: number): number | undefined {
    const rounded = Math.round(level * 100) / 100;
    if (shown === undefined) return rounded;
    if (rounded === shown) return undefined;
    if (rounded === 0 || Math.abs(rounded - shown) >= LEVEL_STEP - 1e-9) return rounded;
    return undefined;
}
