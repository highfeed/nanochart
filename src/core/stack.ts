import type { SeriesState, StackLayout } from './types.js';

/**
 * Builds cumulative baselines for every series that belongs to a stack group.
 * Contributions are weighted by the series alpha so that toggling a series
 * makes the stack collapse smoothly instead of jumping.
 */
export function buildStacks(
  series: readonly SeriesState[],
  alphaOf: (series: SeriesState) => number,
): Map<string, StackLayout> {
  const out = new Map<string, StackLayout>();
  let groups: Map<string, SeriesState[]> | null = null;

  for (const s of series) {
    const key = s.options.stack;
    if (!key) continue;
    groups ??= new Map();
    const list = groups.get(key);
    if (list) list.push(s);
    else groups.set(key, [s]);
  }
  if (!groups) return out;

  for (const list of groups.values()) {
    let length = 0;
    let normalize = false;
    for (const s of list) {
      if (s.data.length > length) length = s.data.length;
      if (s.options.normalize) normalize = true;
    }

    let totals: Float64Array | null = null;
    if (normalize) {
      // Shares are taken against the sum of magnitudes, not the signed sum.
      // Summing signed values makes a column of +10 and -10 total zero, and
      // the whole column then collapses to nothing.
      totals = new Float64Array(length);
      for (const s of list) {
        const alpha = alphaOf(s);
        if (alpha <= 0) continue;
        const column = s.data.y;
        for (let i = 0; i < s.data.length; i++) {
          const v = column[i];
          if (Number.isFinite(v)) totals[i] += Math.abs(v * alpha);
        }
      }
    }

    // Separate cursors so negative values stack downwards from zero.
    const above = new Float64Array(length);
    const below = new Float64Array(length);
    for (const s of list) {
      const base = new Float64Array(length);
      const top = new Float64Array(length);
      const alpha = alphaOf(s);
      const column = s.data.y;
      for (let i = 0; i < length; i++) {
        // A gap contributes nothing, so the rest of the stack keeps its shape.
        const sample = i < s.data.length ? column[i] : Number.NaN;
        const raw = Number.isFinite(sample) ? sample * alpha : 0;
        const value = totals ? (totals[i] > 0 ? (raw / totals[i]) * 100 : 0) : raw;
        // Negatives keep their sign, so they still grow downwards from zero.
        const cursor = value < 0 ? below : above;
        base[i] = cursor[i];
        top[i] = cursor[i] + value;
        cursor[i] = top[i];
      }
      out.set(s.id, { base, top });
    }
  }
  return out;
}
