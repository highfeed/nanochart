import {
  Chart,
  formatCompact,
  formatDate,
  formatGrouped,
  formatMonth,
  formatTime,
  legend,
  rangeSelector,
  registerSeries,
  telegramDark,
  telegramLight,
  tooltip,
  withAlpha,
  xAxis,
  yAxis,
} from '../dist/nanochart.js';
import { depth, infra, kpi, market, money, trading, users } from './crypto-data.js';

const root = document.documentElement;
const charts = [];
let dark = root.dataset.theme === 'dark';

function create(target, options) {
  const chart = new Chart(target, { theme: dark ? telegramDark : telegramLight, ...options });
  charts.push(chart);
  return chart;
}

const usd = (value) =>
  value < 0 ? `-$${formatGrouped(Math.round(-value))}` : `$${formatGrouped(Math.round(value))}`;
const usdShort = (value) => `$${formatCompact(value)}`;
const percent = (value) => `${value}%`;
const btc = (value) => `${formatGrouped(value)} BTC`;
const stamp = (x) => `${formatDate(x)}, ${formatTime(x)}`;
const yearOf = (x) => String(new Date(x).getFullYear());
const signed = (value) => `${value > 0 ? '+' : ''}${value}%`;

const GREEN = { color: '#3cb371', colorDark: '#5fd36f' };
const RED = { color: '#fe3c30', colorDark: '#ff5f57' };
const BLUE = { color: '#3e9ff2', colorDark: '#4aa3f0' };
const PURPLE = { color: '#9c6ade', colorDark: '#ab7ce8' };
const AMBER = { color: '#f5bd25', colorDark: '#ffc94d' };
const TEAL = { color: '#0fb9b1', colorDark: '#2bd4cb' };

// A custom series type: 7x24 activity grid drawn straight onto the canvas.
registerSeries({
  type: 'heatmap',
  cartesian: false,
  draw(ctx, series) {
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const gutter = 34;
    const footer = 18;
    const cellW = (ctx.box.w - gutter) / 24;
    const cellH = (ctx.box.h - footer) / 7;
    const font = ctx.font(10, 500);
    const muted = ctx.color('textMuted');
    const color = ctx.colorOf(series);

    let peak = 1;
    for (const point of series.points) if (point.y > peak) peak = point.y;

    for (const point of series.points) {
      const x = ctx.box.x + gutter + (point.x % 24) * cellW;
      const y = ctx.box.y + Math.floor(point.x / 24) * cellH;
      ctx.r.fillRoundRect(x + 1, y + 1, cellW - 2, cellH - 2, 3, withAlpha(color, 0.08 + (point.y / peak) * 0.92));
    }

    for (let row = 0; row < days.length; row++) {
      ctx.r.text(days[row], ctx.box.x, ctx.box.y + row * cellH + cellH / 2, {
        font,
        color: muted,
        baseline: 'middle',
      });
    }
    for (let hour = 0; hour < 24; hour += 3) {
      ctx.r.text(`${hour}:00`, ctx.box.x + gutter + hour * cellW, ctx.box.y + ctx.box.h - footer / 2, {
        font,
        color: muted,
        baseline: 'middle',
      });
    }
  },
});

// Overview sparklines
const sparkline = (id, data, palette, type = 'area') =>
  create(id, {
    height: 52,
    padding: { top: 6, right: 0, bottom: 4, left: 0 },
    x: { padding: 0.01 },
    y: { zero: type === 'bar', padding: 0.12 },
    series: [
      {
        id: 'spark',
        type,
        name: 'Value',
        curve: 'smooth',
        lineWidth: 1.5,
        fillOpacity: 0.18,
        barWidth: 0.6,
        data,
        ...palette,
      },
    ],
    plugins: [],
  });

sparkline('#spark-price', kpi.price, GREEN);
sparkline('#spark-volume', kpi.volume, BLUE, 'bar');
sparkline('#spark-users', kpi.users, PURPLE);
sparkline('#spark-revenue', kpi.revenue, AMBER);

// Market, hourly
create('#chart-price-24h', {
  height: 320,
  x: { type: 'time' },
  y: { zero: false, padding: 0.08 },
  range: [0.62, 1],
  series: [{ id: 'btc', type: 'line', name: 'BTC/USDT', curve: 'smooth', data: market.price, ...GREEN }],
  plugins: [yAxis({ prefix: '$' }), xAxis(), tooltip({ title: stamp, format: usd }), rangeSelector()],
});

create('#chart-volume-hourly', {
  height: 300,
  x: { type: 'time' },
  series: [{ id: 'volume', type: 'bar', name: 'Volume', data: market.volume, ...BLUE }],
  plugins: [
    yAxis({ suffix: ' BTC' }),
    xAxis(),
    tooltip({ title: stamp, format: btc }),
    rangeSelector(),
  ],
});

create('#chart-orders', {
  height: 300,
  x: { type: 'time' },
  series: [
    { id: 'buys', type: 'bar', name: 'Buy orders', data: market.buys, ...GREEN },
    { id: 'sells', type: 'bar', name: 'Sell orders', data: market.sells, ...RED },
  ],
  plugins: [yAxis(), xAxis(), tooltip({ title: stamp, total: true }), legend()],
});

create('#chart-depth', {
  height: 300,
  x: { padding: 0.01 },
  series: [
    { id: 'bids', type: 'area', name: 'Bids', curve: 'step', fillOpacity: 0.28, data: depth.bids, ...GREEN },
    { id: 'asks', type: 'area', name: 'Asks', curve: 'step', fillOpacity: 0.28, data: depth.asks, ...RED },
  ],
  plugins: [
    yAxis({ suffix: ' BTC' }),
    xAxis({ spacing: 92, prefix: '$' }),
    tooltip({ title: (x) => `$${formatGrouped(x)}`, format: btc }),
    legend(),
  ],
});

// Trading, daily
create('#chart-candles', {
  height: 380,
  x: { type: 'time' },
  y: { zero: false, padding: 0.06 },
  range: [0.55, 1],
  series: [{ id: 'btc', type: 'candlestick', name: 'BTC/USDT', data: trading.candles }],
  plugins: [
    yAxis({ prefix: '$' }),
    xAxis(),
    tooltip({
      format: usd,
      note: (_value, series, index) => {
        const point = series.points[index];
        const change = ((point.close - point.open) / point.open) * 100;
        return `${change >= 0 ? '+' : ''}${change.toFixed(2)}%`;
      },
    }),
    rangeSelector({ height: 52 }),
  ],
});

create('#chart-market-volume', {
  height: 336,
  x: { type: 'time' },
  range: [0.5, 1],
  series: [
    { id: 'spot', type: 'bar', name: 'Spot', stack: 'v', barWidth: 1, data: trading.spot, ...BLUE },
    { id: 'futures', type: 'bar', name: 'Futures', stack: 'v', barWidth: 1, data: trading.futures, ...PURPLE },
    { id: 'options', type: 'bar', name: 'Options', stack: 'v', barWidth: 1, data: trading.options, ...AMBER },
  ],
  plugins: [
    yAxis({ prefix: '$' }),
    xAxis(),
    tooltip({ total: true, format: usdShort }),
    rangeSelector(),
    legend(),
  ],
});

create('#chart-volatility', {
  height: 336,
  x: { type: 'time' },
  y2: { zero: false },
  range: [0.5, 1],
  series: [
    { id: 'vol', type: 'area', name: 'Volatility 24h', axis: 'y', fillOpacity: 0.16, data: trading.volatility, ...AMBER },
    { id: 'price', type: 'line', name: 'BTC price', axis: 'y2', data: trading.price, ...BLUE },
  ],
  plugins: [
    yAxis({ tinted: true, suffix: '%' }),
    yAxis({ axis: 'y2', tinted: true, prefix: '$' }),
    xAxis(),
    tooltip({ format: (value, series) => (series.id === 'price' ? usd(value) : percent(value)) }),
    rangeSelector(),
    legend(),
  ],
});

create('#chart-correlation', {
  height: 336,
  x: { padding: 0.04 },
  y: { zero: false, padding: 0.08 },
  series: [
    { id: 'pairs', type: 'scatter', name: 'ETH vs BTC daily return', radius: 3.5, data: trading.correlation, ...TEAL },
  ],
  plugins: [
    yAxis({ suffix: '%' }),
    xAxis({ spacing: 70, suffix: '%' }),
    tooltip({ title: (x) => `BTC ${signed(x)}`, format: signed }),
    legend(),
  ],
});

// Money
create('#chart-pnl', {
  height: 336,
  x: { type: 'time' },
  range: [0.45, 1],
  series: [
    { id: 'profit', type: 'bar', name: 'Profit', stack: 'pnl', barWidth: 0.9, data: money.profit, ...GREEN },
    { id: 'loss', type: 'bar', name: 'Loss', stack: 'pnl', barWidth: 0.9, data: money.loss, ...RED },
  ],
  plugins: [
    yAxis({ prefix: '$' }),
    xAxis(),
    tooltip({ total: true, totalLabel: 'Net', format: usd }),
    rangeSelector(),
    legend(),
  ],
});

create('#chart-flows', {
  height: 336,
  x: { type: 'time' },
  range: [0.4, 1],
  series: [
    { id: 'deposits', type: 'bar', name: 'Deposits', stack: 'flow', barWidth: 0.9, data: money.deposits, ...BLUE },
    { id: 'withdrawals', type: 'bar', name: 'Withdrawals', stack: 'flow', barWidth: 0.9, data: money.withdrawals, ...PURPLE },
  ],
  plugins: [
    yAxis({ prefix: '$' }),
    xAxis(),
    tooltip({ total: true, totalLabel: 'Net flow', format: usd }),
    rangeSelector(),
    legend(),
  ],
});

create('#chart-fees', {
  height: 336,
  x: { type: 'time' },
  y: { min: 0, max: 100, ticks: 5 },
  range: [0.4, 1],
  series: [
    { id: 'futures', type: 'area', name: 'Futures', stack: 'fees', normalize: true, data: money.fees.futures, ...BLUE },
    { id: 'spot', type: 'area', name: 'Spot', stack: 'fees', normalize: true, data: money.fees.spot, ...PURPLE },
    { id: 'staking', type: 'area', name: 'Staking', stack: 'fees', normalize: true, data: money.fees.staking, ...TEAL },
    { id: 'card', type: 'area', name: 'Card', stack: 'fees', normalize: true, data: money.fees.card, ...AMBER },
    { id: 'launchpad', type: 'area', name: 'Launchpad', stack: 'fees', normalize: true, data: money.fees.launchpad, ...RED },
  ],
  plugins: [
    yAxis({ color: 'rgba(255,255,255,0.9)', labelPosition: 'inside', suffix: '%' }),
    xAxis(),
    tooltip({ format: usd }),
    rangeSelector(),
    legend(),
  ],
});

create('#chart-monthly-revenue', {
  height: 336,
  x: { type: 'time', format: formatMonth, padding: 0.02 },
  y2: { ticks: 4 },
  series: [
    { id: 'revenue', type: 'bar', name: 'Revenue', barWidth: 0.62, data: money.monthlyRevenue, ...BLUE },
    { id: 'margin', type: 'line', name: 'Margin', axis: 'y2', curve: 'smooth', data: money.monthlyMargin, ...AMBER },
  ],
  plugins: [
    yAxis({ prefix: '$' }),
    yAxis({ axis: 'y2', tinted: true, suffix: '%' }),
    xAxis({ spacing: 96 }),
    tooltip({
      title: formatMonth,
      format: (value, series) => (series.id === 'margin' ? percent(value) : usd(value)),
    }),
    legend(),
  ],
});

create('#chart-yearly', {
  height: 336,
  x: { type: 'time', format: yearOf, padding: 0.09 },
  series: [
    { id: 'revenue', type: 'bar', name: 'Revenue', data: money.yearRevenue, ...BLUE },
    { id: 'profit', type: 'bar', name: 'Profit', data: money.yearProfit, ...GREEN },
  ],
  plugins: [
    yAxis({ prefix: '$' }),
    xAxis({ spacing: 60 }),
    tooltip({ title: yearOf, format: usd }),
    legend(),
  ],
});

create('#chart-aum', {
  height: 336,
  x: { type: 'time', format: formatMonth },
  range: [0.3, 1],
  series: [
    { id: 'aum', type: 'area', name: 'Assets under management', curve: 'smooth', fillOpacity: 0.2, data: money.aum, ...TEAL },
  ],
  plugins: [
    yAxis({ prefix: '$' }),
    xAxis({ spacing: 96 }),
    tooltip({ title: formatMonth, format: usd }),
    rangeSelector(),
  ],
});

// Users
create('#chart-active-users', {
  height: 336,
  x: { type: 'time' },
  range: [0.45, 1],
  series: [
    { id: 'mau', type: 'line', name: 'MAU', data: users.mau, ...PURPLE },
    { id: 'wau', type: 'line', name: 'WAU', data: users.wau, ...BLUE },
    { id: 'dau', type: 'line', name: 'DAU', data: users.dau, ...GREEN },
  ],
  plugins: [yAxis(), xAxis(), tooltip(), rangeSelector(), legend()],
});

create('#chart-signups', {
  height: 336,
  x: { type: 'time' },
  y2: { ticks: 4, zero: false },
  range: [0.45, 1],
  series: [
    { id: 'signups', type: 'bar', name: 'Signups', barWidth: 0.9, data: users.signups, ...BLUE },
    { id: 'kyc', type: 'line', name: 'KYC passed', axis: 'y2', curve: 'smooth', data: users.kycRate, ...GREEN },
  ],
  plugins: [
    yAxis(),
    yAxis({ axis: 'y2', tinted: true, suffix: '%' }),
    xAxis(),
    tooltip({ format: (value, series) => (series.id === 'kyc' ? percent(value) : formatGrouped(value)) }),
    rangeSelector(),
    legend(),
  ],
});

create('#chart-retention', {
  height: 336,
  x: { type: 'time', format: formatMonth, padding: 0.02 },
  y: { ticks: 4 },
  series: [
    { id: 'd1', type: 'line', name: 'Day 1', curve: 'smooth', data: users.retention.d1, ...GREEN },
    { id: 'd7', type: 'line', name: 'Day 7', curve: 'smooth', data: users.retention.d7, ...BLUE },
    { id: 'd30', type: 'line', name: 'Day 30', curve: 'smooth', data: users.retention.d30, ...PURPLE },
  ],
  plugins: [
    yAxis({ suffix: '%' }),
    xAxis({ spacing: 96 }),
    tooltip({ title: formatMonth, format: percent }),
    legend(),
  ],
});

create('#chart-heatmap', {
  height: 260,
  padding: { top: 10, right: 4, bottom: 4, left: 4 },
  series: [{ id: 'activity', type: 'heatmap', name: 'Sessions', data: users.activity, ...BLUE }],
  plugins: [],
});

create('#chart-countries', {
  height: 306,
  series: users.countries.map((country) => ({
    id: country.id,
    type: 'pie',
    name: country.name,
    innerRadius: 0.58,
    data: [country.value],
  })),
  plugins: [tooltip(), legend()],
});

create('#chart-devices', {
  height: 306,
  series: users.devices.map((device) => ({
    id: device.id,
    type: 'pie',
    name: device.name,
    data: [device.value],
  })),
  plugins: [tooltip(), legend()],
});

// Infrastructure
create('#chart-latency', {
  height: 336,
  x: { type: 'time' },
  series: [
    { id: 'p99', type: 'line', name: 'p99', data: infra.p99, ...RED },
    { id: 'p95', type: 'line', name: 'p95', data: infra.p95, ...AMBER },
    { id: 'p50', type: 'line', name: 'p50', data: infra.p50, ...GREEN },
  ],
  plugins: [
    yAxis({ suffix: ' ms' }),
    xAxis(),
    tooltip({ title: stamp, format: (value) => `${value} ms` }),
    rangeSelector(),
    legend(),
  ],
});

create('#chart-errors', {
  height: 300,
  x: { type: 'time' },
  y: { ticks: 4 },
  series: [
    { id: 'errors', type: 'area', name: 'Error rate', curve: 'smooth', fillOpacity: 0.2, data: infra.errorRate, ...RED },
  ],
  plugins: [
    yAxis({ suffix: '%' }),
    xAxis(),
    tooltip({ title: stamp, format: percent }),
    rangeSelector(),
  ],
});

create('#chart-throughput', {
  height: 300,
  x: { type: 'time' },
  y2: { ticks: 4 },
  series: [
    { id: 'rps', type: 'line', name: 'Requests/s', axis: 'y', data: infra.rps, ...BLUE },
    { id: 'rejected', type: 'bar', name: 'Rejected', axis: 'y2', barWidth: 0.5, data: infra.rejected, ...RED },
  ],
  plugins: [
    yAxis({ tinted: true }),
    yAxis({ axis: 'y2', tinted: true }),
    xAxis(),
    tooltip({ title: stamp }),
    legend(),
  ],
});

const toggle = document.getElementById('theme-toggle');
const label = toggle.querySelector('.switch__label');

function applyTheme(next) {
  dark = next;
  root.dataset.theme = dark ? 'dark' : 'light';
  localStorage.setItem('nanochart-theme', root.dataset.theme);
  label.textContent = dark ? 'Day Mode' : 'Night Mode';
  toggle.setAttribute('aria-pressed', String(dark));
  for (const chart of charts) chart.setTheme(dark ? telegramDark : telegramLight);
}

applyTheme(dark);
toggle.addEventListener('click', () => applyTheme(!dark));

window.charts = charts;
