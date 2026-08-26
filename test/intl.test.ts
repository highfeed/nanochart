import { beforeAll, describe, expect, it } from 'vitest';
import { drawOnce, installCanvas, mount } from './helpers/dom.js';
import { Chart } from '../src/core/chart.js';
import { createFormats } from '../src/core/intl.js';
import { timeTicks } from '../src/core/scale.js';
import { createFormats as createFormatsFromEntry, xAxis } from '../src/index.js';

beforeAll(installCanvas);

const DAY = 86_400_000;
// 2023-01-07T15:30:00Z — afternoon in London, next morning in Tokyo.
const T = Date.UTC(2023, 0, 7, 15, 30);

describe('createFormats', () => {
  it('formats dates in the requested locale', () => {
    expect(createFormats('en-US', 'UTC').day(T)).toBe('Jan 7');
    expect(createFormats('de-DE', 'UTC').day(T)).toMatch(/7\.?\s*Jan/);
    expect(createFormats('ru-RU', 'UTC').day(T)).toMatch(/7/);
  });

  it('is reachable from the package entry', () => {
    // A tooltip `title` is built before its chart, so it cannot read
    // `chart.formats`; without this export the only helpers a caller has
    // answer in the host's zone.
    expect(createFormatsFromEntry('en-GB', 'UTC').time(T)).toBe('15:30');
  });

  it('formats numbers in the requested locale', () => {
    expect(createFormats('en-US').number(1234567.5)).toBe('1,234,567.5');
    // Most European locales group with a dot or a space, not a comma.
    expect(createFormats('de-DE').number(1234567)).not.toBe('1,234,567');
  });

  it('honours the timezone when reading the clock', () => {
    expect(createFormats('en-GB', 'UTC').time(T)).toBe('15:30');
    expect(createFormats('en-GB', 'Asia/Tokyo').time(T)).toBe('00:30');
  });

  it('finds midnight in the configured zone, not the host zone', () => {
    const utc = createFormats('en-GB', 'UTC');
    const tokyo = createFormats('en-GB', 'Asia/Tokyo');
    expect(utc.startOfDay(T)).toBe(Date.UTC(2023, 0, 7));
    // Tokyo is UTC+9, so its day containing 15:30Z began at 15:00Z the day before.
    expect(tokyo.startOfDay(T)).toBe(Date.UTC(2023, 0, 7, 15, 0));
  });

  it('steps whole calendar months', () => {
    const utc = createFormats('en-GB', 'UTC');
    expect(utc.addMonths(Date.UTC(2023, 0, 31), 1)).toBe(utc.addMonths(Date.UTC(2023, 0, 31), 1));
    expect(utc.monthOf(utc.addMonths(Date.UTC(2023, 10, 15), 2))).toBe(0);
  });

  it('starts the calendar month in the configured zone', () => {
    expect(createFormats('en-GB', 'UTC').startOfMonth(T)).toBe(Date.UTC(2023, 0, 1));
  });
});

describe('time ticks', () => {
  it('anchors day ticks to midnight in the chart timezone', () => {
    const utc = createFormats('en-GB', 'UTC');
    const ticks = timeTicks(T, T + 5 * DAY, 5, utc);
    for (const tick of ticks) {
      expect(new Date(tick).getUTCHours()).toBe(0);
    }
  });

  it('anchors to a different instant in a different zone', () => {
    const tokyo = createFormats('en-GB', 'Asia/Tokyo');
    const ticks = timeTicks(T, T + 5 * DAY, 5, tokyo);
    // Midnight in Tokyo is 15:00 the previous day in UTC.
    for (const tick of ticks) {
      expect(new Date(tick).getUTCHours()).toBe(15);
    }
  });
});

describe('locales that do not spell numbers in Latin digits', () => {
  // The wall clock is read back with `Number` and handed to `Date.UTC`, so a
  // locale whose digits are Arabic-Indic, or whose calendar is not Gregorian,
  // used to produce an invalid instant and throw out of the middle of a frame.
  it('still reads its own wall clock', () => {
    for (const locale of ['ar-EG', 'fa-IR', 'bn-BD', 'my-MM', 'th-TH']) {
      const formats = createFormats(locale, 'UTC');
      expect(new Date(formats.startOfDay(T)).toISOString()).toBe('2023-01-07T00:00:00.000Z');
      expect(formats.monthOf(T)).toBe(0);
      expect(new Date(formats.addMonths(T, 2)).toISOString()).toBe('2023-03-07T15:30:00.000Z');
    }
  });

  it('keeps its own digits in the labels a reader sees', () => {
    // Only the arithmetic is pinned to Latin; the display is still the locale's.
    expect(createFormats('ar-EG', 'UTC').day(T)).toMatch(/[\u0660-\u0669]/);
  });

  it('draws a time axis without throwing', () => {
    const host = mount(600, 300);
    const chart = new Chart(host, {
      animation: false,
      height: 300,
      locale: 'ar-EG',
      timeZone: 'UTC',
      x: { type: 'time' },
      series: [{ id: 'a', type: 'line', data: Array.from({ length: 20 }, (_, i) => [T + i * DAY, i]) }],
      plugins: [xAxis()],
    });
    expect(drawOnce(chart).texts().length).toBeGreaterThan(0);
    chart.destroy();
  });
});

describe('chart locale', () => {
  it('labels its x axis through the configured locale and zone', () => {
    const host = mount(600, 300);
    const chart = new Chart(host, {
      animation: false,
      height: 300,
      locale: 'en-US',
      timeZone: 'UTC',
      x: { type: 'time' },
      series: [{ id: 'a', type: 'line', data: Array.from({ length: 20 }, (_, i) => [T + i * DAY, i]) }],
      plugins: [xAxis()],
    });
    const labels = drawOnce(chart).texts();
    expect(labels.some((l) => /Jan|Feb/.test(l))).toBe(true);
    chart.destroy();
  });

  it('gives a different chart a different language', () => {
    const host = mount(600, 300);
    const chart = new Chart(host, {
      animation: false,
      height: 300,
      locale: 'de-DE',
      timeZone: 'UTC',
      x: { type: 'time' },
      series: [{ id: 'a', type: 'line', data: Array.from({ length: 20 }, (_, i) => [T + i * DAY, i]) }],
      plugins: [xAxis()],
    });
    const labels = drawOnce(chart).texts();
    expect(labels.some((l) => /Jan|Feb|Mär/.test(l))).toBe(true);
    expect(chart.formats.locale).toBe('de-DE');
    chart.destroy();
  });
});
