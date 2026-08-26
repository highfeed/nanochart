import {
  Chart,
  formatGrouped,
  legend,
  rangeSelector,
  telegramDark,
  telegramLight,
  tooltip,
  xAxis,
  yAxis,
} from '../dist/nanochart.js';
import { apps, content, followers, fruits, messages, sources } from './data.js';

const root = document.documentElement;
const charts = [];
let dark = root.dataset.theme === 'dark';

function create(target, options) {
  const chart = new Chart(target, { theme: dark ? telegramDark : telegramLight, ...options });
  charts.push(chart);
  return chart;
}

create('#chart-followers', {
  height: 336,
  ariaLabel: 'Followers joined and left per day',
  x: { type: 'time' },
  range: [0.6, 1],
  series: [
    { id: 'joined', type: 'line', name: 'Joined', data: followers.joined, color: '#4bd964', colorDark: '#5fd36f' },
    { id: 'left', type: 'line', name: 'Left', data: followers.left, color: '#fe3c30', colorDark: '#ff5f57' },
  ],
  plugins: [yAxis(), xAxis(), tooltip(), rangeSelector(), legend()],
});

create('#chart-sources', {
  height: 336,
  ariaLabel: 'Views by source',
  x: { type: 'time' },
  range: [0.55, 1],
  series: [
    { id: 'search', type: 'bar', name: 'Search', stack: 'views', barWidth: 1, data: sources.search, color: '#3e9ff2', colorDark: '#4aa3f0' },
    { id: 'channels', type: 'bar', name: 'Channels', stack: 'views', barWidth: 1, data: sources.channels, color: '#9c6ade', colorDark: '#ab7ce8' },
    { id: 'groups', type: 'bar', name: 'Groups', stack: 'views', barWidth: 1, data: sources.groups, color: '#f5bd25', colorDark: '#ffc94d' },
  ],
  plugins: [yAxis(), xAxis(), tooltip({ total: true }), rangeSelector(), legend()],
});

create('#chart-content', {
  height: 336,
  ariaLabel: 'Share of message types',
  x: { type: 'time' },
  y: { min: 0, max: 100, ticks: 5, format: (value) => `${value}%` },
  range: [0.45, 1],
  series: [
    { id: 'text', type: 'area', name: 'Text', stack: 'content', normalize: true, data: content.text },
    { id: 'photos', type: 'area', name: 'Photos', stack: 'content', normalize: true, data: content.photos },
    { id: 'videos', type: 'area', name: 'Videos', stack: 'content', normalize: true, data: content.videos },
    { id: 'files', type: 'area', name: 'Files', stack: 'content', normalize: true, data: content.files },
    { id: 'voice', type: 'area', name: 'Voice', stack: 'content', normalize: true, data: content.voice },
  ],
  plugins: [
    yAxis({ color: 'rgba(255,255,255,0.9)', labelPosition: 'inside' }),
    xAxis(),
    tooltip(),
    rangeSelector(),
    legend(),
  ],
});

create('#chart-messages', {
  height: 286,
  ariaLabel: 'Messages per day',
  x: { type: 'time' },
  range: [0.4, 1],
  series: [{ id: 'messages', type: 'bar', name: 'Messages', data: messages, color: '#3e9ff2', colorDark: '#4aa3f0' }],
  plugins: [yAxis(), xAxis(), tooltip(), rangeSelector()],
});

create('#chart-apps', {
  height: 336,
  ariaLabel: 'Active users and revenue',
  x: { type: 'time' },
  y: { ticks: 4 },
  y2: { ticks: 4 },
  range: [0.35, 1],
  series: [
    { id: 'users', type: 'line', name: 'Users', axis: 'y', data: apps.users, color: '#3e9ff2', colorDark: '#4aa3f0' },
    { id: 'revenue', type: 'line', name: 'Revenue', axis: 'y2', curve: 'smooth', data: apps.revenue, color: '#9c6ade', colorDark: '#ab7ce8' },
  ],
  plugins: [
    yAxis({ tinted: true }),
    yAxis({ axis: 'y2', tinted: true }),
    xAxis(),
    tooltip({
      format: (value, series) => (series.id === 'revenue' ? `$${formatGrouped(value)}` : formatGrouped(value)),
    }),
    rangeSelector(),
    legend(),
  ],
});

create('#chart-fruits', {
  height: 306,
  ariaLabel: 'Orders by fruit',
  series: fruits.map((fruit) => ({
    id: fruit.id,
    type: 'pie',
    name: fruit.name,
    innerRadius: 0.56,
    data: [fruit.value],
  })),
  plugins: [tooltip(), legend()],
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

// Handy for poking at the API from the devtools console.
window.charts = charts;
