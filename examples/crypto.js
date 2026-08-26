import {
  a11y,
  Chart,
  createFormats,
  formatCompact,
  formatGrouped,
  legend,
  rangeSelector,
  registerSeries,
  telegramDark,
  telegramLight,
  tooltip,
  withAlpha,
  xAxis,
  yAxis,
  zoom,
} from '../dist/nanochart.js';
import { annotate } from './annotations.js';
import { depth, infra, kpi, market, money, tape, trading, users } from './crypto-data.js';

const root = document.documentElement;
const charts = [];
let dark = root.dataset.theme === 'dark';

// An exchange quotes UTC, whatever timezone the reader happens to be in.
const LOCALE = 'en-GB';
const ZONE = 'UTC';
/**
 * The same formatters every chart on this page gets as `chart.formats`.
 *
 * A tooltip title is built before its chart exists, so it cannot read
 * `chart.formats`; the exported `formatDate` and friends would answer in the
 * reader's own zone and disagree with the axis underneath them by their offset.
 */
const formats = createFormats(LOCALE, ZONE);

function create(target, options) {
  const chart = new Chart(target, {
    theme: dark ? telegramDark : telegramLight,
    timeZone: ZONE,
    locale: LOCALE,
    ...options,
  });
  charts.push(chart);
  return chart;
}

const usd = (value) =>
  value < 0 ? `-$${formatGrouped(Math.round(-value))}` : `$${formatGrouped(Math.round(value))}`;
// A price the tape quotes to the cent, at a fixed width: a readout that
// changes every second should not also change size every second.
const quotes = new Intl.NumberFormat(LOCALE, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const cents = (value) => `$${quotes.format(value)}`;
const usdShort = (value) => `$${formatCompact(value)}`;
const percent = (value) => `${value}%`;
const btc = (value) => `${formatGrouped(value)} BTC`;
const stamp = (x) => `${formats.date(x)}, ${formats.time(x)}`;
const monthOf = (x) => formats.month(x);
// `Formats` has no year of its own; the zone is what matters, and reading it
// off the host clock reports the wrong year outright around 1 January.
const years = new Intl.DateTimeFormat(LOCALE, { timeZone: ZONE, year: 'numeric' });
const yearOf = (x) => years.format(x);
// `Formats` stops at minutes, and a tape that prints every second needs the
// second. Same locale, same zone, one more field.
const seconds = new Intl.DateTimeFormat(LOCALE, {
  timeZone: ZONE,
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});
const clock = (x) => seconds.format(x);
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

    // Samples are columnar: parallel typed arrays rather than point objects.
    const { x: slots, y: values, length } = series.data;

    let peak = 1;
    for (let i = 0; i < length; i++) if (values[i] > peak) peak = values[i];

    for (let i = 0; i < length; i++) {
      const x = ctx.box.x + gutter + (slots[i] % 24) * cellW;
      const y = ctx.box.y + Math.floor(slots[i] / 24) * cellH;
      ctx.r.fillRoundRect(x + 1, y + 1, cellW - 2, cellH - 2, 3, withAlpha(color, 0.08 + (values[i] / peak) * 0.92));
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

// Live: the only chart on this page whose data moves.
//
// Every other series here is generated once and never touched again. This one
// takes a trade a second through `updateSeries`, which re-parses the one series
// it names — patching the tape rather than re-reading the dashboard every
// second, which is what handing the whole list back to `setSeries` would cost.
const feed = tape();
let trades = feed.history;

const live = create('#chart-live', {
  height: 300,
  x: { type: 'time', format: clock, padding: 0.01 },
  y: { zero: false, padding: 0.22 },
  series: [
    { id: 'tape', type: 'area', name: 'BTC/USDT', lineWidth: 2, fillOpacity: 0.16, data: trades, ...GREEN },
  ],
  plugins: [yAxis({ prefix: '$' }), xAxis({ spacing: 88 }), tooltip({ title: clock, format: cents })],
});

const readout = document.getElementById('live-readout');
const priceOut = document.getElementById('live-price');
const deltaOut = document.getElementById('live-delta');
const stampOut = document.getElementById('live-stamp');
const pauseButton = document.getElementById('live-pause');

/** Fills the readout from one sample, or from the newest when index < 0. */
function report(index) {
  // Columns, not points: the readout reads the same arrays the renderer does.
  const { x, y, length } = live.seriesById('tape').data;
  const at = index < 0 ? length - 1 : index;
  const change = ((y[at] - y[0]) / y[0]) * 100;
  priceOut.textContent = cents(y[at]);
  deltaOut.textContent = `${change >= 0 ? '+' : ''}${change.toFixed(2)}%`;
  deltaOut.className = `readout__delta readout__delta--${change >= 0 ? 'up' : 'down'}`;
  stampOut.textContent = clock(x[at]);
}

// The chart reports where the pointer is; what to say about it is the page's
// business. A headline price belongs above the canvas in real DOM, where it
// can be read by something other than an eye, and not in a card that follows
// the cursor around.
live.on('hover', ({ index }) => report(index));

let paused = false;
let timer = 0;

function print() {
  // One in, the oldest out. A new array each time: `updateSeries` copies the
  // data it is handed into columns, it does not watch the one it was given.
  trades = [...trades.slice(1), feed.next()];
  live.updateSeries('tape', { data: trades });
  if (live.hoverIndex < 0) report(-1);
}

const start = () => {
  if (!timer) timer = window.setInterval(print, feed.step);
};
const stop = () => {
  window.clearInterval(timer);
  timer = 0;
};

pauseButton.addEventListener('click', () => {
  paused = !paused;
  pauseButton.textContent = paused ? 'Resume' : 'Pause';
  pauseButton.setAttribute('aria-pressed', String(paused));
  readout.classList.toggle('readout--paused', paused);
  if (paused) stop();
  else start();
});

// A hidden tab paints nothing and throttles timers to whatever it feels like,
// so a tape that keeps printing into one is spending a phone's battery on
// frames no one will ever see.
document.addEventListener('visibilitychange', () => {
  if (document.hidden || paused) stop();
  else start();
});

report(-1);
start();

// Market, hourly
const price = create('#chart-price-24h', {
  height: 320,
  x: { type: 'time' },
  y: { zero: false, padding: 0.08 },
  range: [0.62, 1],
  series: [{ id: 'btc', type: 'line', name: 'BTC/USDT', curve: 'smooth', data: market.price, ...GREEN }],
  plugins: [
    yAxis({ prefix: '$' }),
    xAxis(),
    tooltip({ title: stamp, format: usd }),
    rangeSelector(),
    // This page is long. Without a modifier the wheel would zoom the chart
    // under the pointer instead of scrolling past it.
    zoom({ modifier: 'ctrl' }),
    a11y({ summary: 'BTC/USDT price over 24 hours' }),
  ],
});

const volume = create('#chart-volume-hourly', {
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

/**
 * One window, two charts.
 *
 * `setRange` is the call the scrubber and the wheel already make, so a chart
 * driven from outside behaves exactly as if it had been dragged. The echo ends
 * on its own: the second chart reports the window it just took, the first one
 * is already there, and `setRange` returns without emitting again.
 *
 * A range is a fraction of a chart's own x extent, so this says anything only
 * while both cover the same hours — as price and volume do here.
 */
function share(a, b) {
  a.on('rangechange', ({ from, to }) => b.setRange(from, to, false));
  b.on('rangechange', ({ from, to }) => a.setRange(from, to, false));
  b.setRange(...a.range(), false);
}

share(price, volume);

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
        // OHLC lives in its own columns alongside x and y.
        const { open, close } = series.data;
        const change = ((close[index] - open[index]) / open[index]) * 100;
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
  x: { type: 'time', format: monthOf, padding: 0.02 },
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
      title: monthOf,
      format: (value, series) => (series.id === 'margin' ? percent(value) : usd(value)),
    }),
    // A plugin of this page's own, registered like any other.
    annotate({ lines: [{ value: 40, axis: 'y2', tone: 'positive', label: 'Target 40%' }] }),
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
    yAxis({ prefix: '$', placement: 'outside' }),
    xAxis({ spacing: 60 }),
    tooltip({ title: yearOf, format: usd }),
    legend({ position: 'top', align: 'end' }),
  ],
});

create('#chart-aum', {
  height: 336,
  x: { type: 'time', format: monthOf },
  range: [0.3, 1],
  series: [
    { id: 'aum', type: 'area', name: 'Assets under management', curve: 'smooth', fillOpacity: 0.2, data: money.aum, ...TEAL },
  ],
  plugins: [
    yAxis({ prefix: '$' }),
    xAxis({ spacing: 96 }),
    tooltip({ title: monthOf, format: usd }),
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
  x: { type: 'category', categories: users.devices.map((device) => device.name) },
  series: [
    { id: 'sessions', type: 'bar', name: 'Sessions', data: users.devices.map((d) => d.value), ...BLUE },
  ],
  plugins: [
    yAxis(),
    xAxis({ spacing: 60 }),
    tooltip({ format: formatGrouped }),
  ],
});

// Infrastructure
create('#chart-latency', {
  height: 336,
  x: { type: 'time' },
  // p50 sits near 15 ms and p99 near 300; on a linear axis the median is a
  // flat line along the bottom.
  y: { type: 'log' },
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

// The samples collection missed, as a half-open range.
const OUTAGE = [38, 44];

const errors = create('#chart-errors', {
  height: 300,
  x: { type: 'time' },
  y: { ticks: 4 },
  series: [
    {
      id: 'errors',
      type: 'area',
      name: 'Error rate',
      curve: 'smooth',
      fillOpacity: 0.2,
      // Collection was down for six samples. A gap, not a run of zeroes:
      // null breaks the line rather than claiming the error rate fell. The
      // timestamp stays — a bare null in a series of [x, y] pairs has no x of
      // its own, and would be placed at the epoch.
      data: infra.errorRate.map(([x, value], i) => [x, i >= OUTAGE[0] && i < OUTAGE[1] ? null : value]),
      ...RED,
    },
  ],
  plugins: [
    yAxis({ suffix: '%' }),
    xAxis(),
    tooltip({ title: stamp, format: percent }),
    rangeSelector(),
  ],
});

// `use()` hands a plugin to a chart that is already on screen — the same list
// the `plugins` option fills at construction. This one lives next door in
// `annotations.js`: a threshold and a band, drawn on the canvas rather than
// positioned over it, so both follow an animating domain and cross-fade with
// the theme like everything else.
errors.use(
  annotate({
    // The band covers the break in the line, so it reaches from the last
    // sample before the outage to the first one after it.
    bands: [
      {
        from: infra.errorRate[OUTAGE[0] - 1][0],
        to: infra.errorRate[OUTAGE[1]][0],
        label: 'outage',
      },
    ],
    lines: [{ value: 0.5, label: 'SLO 0.5%' }],
  }),
);

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
