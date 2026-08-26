export const HOUR = 3600000;
export const DAY = 86400000;

/** Deterministic PRNG, so every reload shows the same numbers. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hours(count) {
  const end = new Date();
  end.setMinutes(0, 0, 0);
  const start = end.getTime() - (count - 1) * HOUR;
  return Array.from({ length: count }, (_, i) => start + i * HOUR);
}

export function days(count) {
  const end = new Date();
  end.setHours(0, 0, 0, 0);
  const start = end.getTime() - (count - 1) * DAY;
  return Array.from({ length: count }, (_, i) => start + i * DAY);
}

export function months(count) {
  const end = new Date();
  end.setHours(0, 0, 0, 0);
  end.setDate(1);
  return Array.from({ length: count }, (_, i) => {
    const date = new Date(end);
    date.setMonth(date.getMonth() - (count - 1 - i));
    return date.getTime();
  });
}

export function years(count) {
  const end = new Date();
  end.setHours(0, 0, 0, 0);
  end.setMonth(0, 1);
  return Array.from({ length: count }, (_, i) => {
    const date = new Date(end);
    date.setFullYear(date.getFullYear() - (count - 1 - i));
    return date.getTime();
  });
}

/**
 * Random walk with a drift and a repeating swing, so the series looks like
 * something a real service would report.
 */
export function walk({
  seed,
  count,
  start,
  drift = 0,
  noise = 0,
  swing = 0,
  period = 7,
  phase = 1.2,
  min = 0,
  decimals = 0,
}) {
  const random = mulberry32(seed);
  const factor = 10 ** decimals;
  const out = new Array(count);
  let value = start;
  for (let i = 0; i < count; i++) {
    // Mean reversion towards the trend keeps the walk from drifting to zero.
    value += (start + drift * i - value) * 0.08 + drift + (random() - 0.5) * noise;
    const season = 1 + Math.sin((i / period) * Math.PI * 2 - phase) * swing;
    out[i] = Math.max(min, Math.round(value * season * factor) / factor);
  }
  return out;
}

export const zip = (times, values) => times.map((time, i) => [time, values[i]]);
