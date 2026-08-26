import type { Theme } from '../core/types.js';

const FONT =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

/** Telegram day theme. */
export const telegramLight: Theme = {
  name: 'telegram-light',
  dark: false,
  font: FONT,
  background: '#ffffff',
  text: '#101418',
  textMuted: '#8e8e93',
  grid: 'rgba(24,45,59,0.10)',
  crosshair: 'rgba(24,45,59,0.20)',
  positive: '#4bd964',
  negative: '#fe3c30',
  tooltipBackground: '#ffffff',
  tooltipText: '#101418',
  tooltipMuted: '#8e8e93',
  tooltipBorder: 'rgba(24,45,59,0.08)',
  tooltipShadow: 'rgba(24,45,59,0.22)',
  overlay: 'rgba(226,238,249,0.62)',
  handle: '#c0d1e1',
  handleGrip: '#ffffff',
  palette: ['#3e9ff2', '#4bd964', '#fe3c30', '#f5bd25', '#9c6ade', '#0fb9b1'],
};

/** Telegram night theme. */
export const telegramDark: Theme = {
  name: 'telegram-dark',
  dark: true,
  font: FONT,
  background: '#242f3e',
  text: '#ffffff',
  textMuted: '#8596ab',
  grid: 'rgba(255,255,255,0.10)',
  crosshair: 'rgba(255,255,255,0.22)',
  positive: '#5fd36f',
  negative: '#ff5f57',
  tooltipBackground: '#1c2533',
  tooltipText: '#ffffff',
  tooltipMuted: '#8596ab',
  tooltipBorder: 'rgba(255,255,255,0.06)',
  tooltipShadow: 'rgba(0,0,0,0.40)',
  overlay: 'rgba(31,42,58,0.72)',
  handle: '#56626d',
  handleGrip: '#ffffff',
  palette: ['#4aa3f0', '#5fd36f', '#ff5f57', '#ffc94d', '#ab7ce8', '#2bd4cb'],
};

export function createTheme(base: Theme, overrides: Partial<Theme>): Theme {
  return { ...base, ...overrides };
}
