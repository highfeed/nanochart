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
      if (s.points.length > length) length = s.points.length;
      if (s.options.normalize) normalize = true;
    }

    let totals: Float64Array | null = null;
    if (normalize) {
      totals = new Float64Array(length);
      for (const s of list) {
        const alpha = alphaOf(s);
        if (alpha <= 0) continue;
        for (let i = 0; i < s.points.length; i++) totals[i] += s.points[i].y * alpha;
      }
    }

    // Separate cursors so negative values stack downwards from zero.
    const above = new Float64Array(length);
    const below = new Float64Array(length);
    for (const s of list) {
      const base = new Float64Array(length);
      const top = new Float64Array(length);
      const alpha = alphaOf(s);
      for (let i = 0; i < length; i++) {
        const raw = i < s.points.length ? s.points[i].y * alpha : 0;
        const value = totals ? (totals[i] > 0 ? (raw / totals[i]) * 100 : 0) : raw;
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
