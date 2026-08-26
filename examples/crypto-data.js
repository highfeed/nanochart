import { days, hours, months, mulberry32, walk, years, zip } from './random.js';

const round = (value, decimals = 2) => {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
};

/** Open/high/low/close walk for candlestick series. */
function candles({ seed, times, start, vol, drift = 0 }) {
  const random = mulberry32(seed);
  let price = start;
  return times.map((x) => {
    const open = price;
    const close = Math.max(1, open * (1 + drift + (random() - 0.5) * vol));
    const high = Math.max(open, close) * (1 + random() * vol * 0.6);
    const low = Math.min(open, close) * (1 - random() * vol * 0.6);
    price = close;
    return { x, open: round(open), high: round(high), low: round(low), close: round(close) };
  });
}

/** Splits a signed series into a positive and a negative half for diverging bars. */
function split(times, values) {
  return {
    up: times.map((time, i) => [time, Math.max(0, values[i])]),
    down: times.map((time, i) => [time, Math.min(0, values[i])]),
  };
}

const h72 = hours(72);
const h48 = hours(48);
const d30 = days(30);
const d90 = days(90);
const d120 = days(120);
const d180 = days(180);
const m24 = months(24);
const m36 = months(36);
const y7 = years(7);

// Overview sparklines
export const kpi = {
  price: zip(h48, walk({ seed: 11, count: 48, start: 66800, drift: 32, noise: 620, swing: 0.004, period: 24, decimals: 2 })),
  volume: zip(h48, walk({ seed: 12, count: 48, start: 780, drift: 2, noise: 260, swing: 0.35, period: 24 })),
  users: zip(d30, walk({ seed: 13, count: 30, start: 41200, drift: 260, noise: 3600, swing: 0.08 })),
  revenue: zip(d30, walk({ seed: 14, count: 30, start: 184000, drift: 1900, noise: 42000, swing: 0.12 })),
};

// Market, hourly
export const market = {
  price: zip(h72, walk({ seed: 21, count: 72, start: 65400, drift: 46, noise: 780, swing: 0.006, period: 24, decimals: 2 })),
  volume: zip(h72, walk({ seed: 22, count: 72, start: 640, drift: 1.5, noise: 240, swing: 0.42, period: 24 })),
  buys: zip(h72, walk({ seed: 23, count: 72, start: 3100, drift: 6, noise: 1100, swing: 0.32, period: 24 })),
  sells: zip(h72, walk({ seed: 24, count: 72, start: 2840, drift: 4, noise: 1000, swing: 0.3, period: 24, phase: 2.4 })),
};

export const depth = (() => {
  const random = mulberry32(31);
  const mid = 68420;
  const bids = [];
  const asks = [];
  let bid = 0;
  let ask = 0;
  for (let i = 1; i <= 70; i++) {
    bid += 4 + random() * 26 + i * 0.4;
    ask += 4 + random() * 26 + i * 0.35;
    bids.push([round(mid * (1 - i * 0.0004)), round(bid, 1)]);
    asks.push([round(mid * (1 + i * 0.0004)), round(ask, 1)]);
  }
  return { mid, bids: bids.reverse(), asks };
})();

// Trading, daily
export const trading = {
  candles: candles({ seed: 41, times: d180, start: 43800, vol: 0.055, drift: 0.0026 }),
  spot: zip(d180, walk({ seed: 42, count: 180, start: 940e6, drift: 3.4e6, noise: 300e6, swing: 0.22 })),
  futures: zip(d180, walk({ seed: 43, count: 180, start: 2.1e9, drift: 8.6e6, noise: 720e6, swing: 0.26 })),
  options: zip(d180, walk({ seed: 44, count: 180, start: 320e6, drift: 1.8e6, noise: 160e6, swing: 0.3 })),
  volatility: zip(d180, walk({ seed: 45, count: 180, start: 3.4, noise: 1.9, swing: 0.24, min: 0.4, decimals: 2 })),
  price: zip(d180, walk({ seed: 46, count: 180, start: 44100, drift: 128, noise: 2600, swing: 0.02, decimals: 0 })),
  correlation: (() => {
    const random = mulberry32(47);
    return Array.from({ length: 420 }, () => {
      const btc = (random() - 0.5) * 9.4;
      return { x: round(btc), y: round(btc * 1.16 + (random() - 0.5) * 4.2) };
    });
  })(),
};

// Money
const pnl = split(
  d120,
  walk({ seed: 51, count: 120, start: 120, drift: 1.6, noise: 900, swing: 0.4, min: -1e9 }).map(
    (value, i) => Math.round(value - (i % 11 === 0 ? 1400 : 0)),
  ),
);

const flows = walk({ seed: 52, count: 90, start: 460000, drift: 3200, noise: 180000, swing: 0.2 });

export const money = {
  profit: pnl.up,
  loss: pnl.down,
  deposits: zip(d90, flows),
  withdrawals: zip(
    d90,
    walk({ seed: 53, count: 90, start: 320000, drift: 2100, noise: 150000, swing: 0.26 }).map((v) => -v),
  ),
  fees: {
    spot: zip(d120, walk({ seed: 54, count: 120, start: 42000, drift: 180, noise: 9000, swing: 0.18 })),
    futures: zip(d120, walk({ seed: 55, count: 120, start: 68000, drift: 420, noise: 14000, swing: 0.22 })),
    staking: zip(d120, walk({ seed: 56, count: 120, start: 12400, drift: 160, noise: 3200, swing: 0.12 })),
    card: zip(d120, walk({ seed: 57, count: 120, start: 7600, drift: 90, noise: 2400, swing: 0.3 })),
    launchpad: zip(d120, walk({ seed: 58, count: 120, start: 3100, drift: 140, noise: 2800, swing: 0.5 })),
  },
  monthlyRevenue: zip(m24, walk({ seed: 59, count: 24, start: 3.4e6, drift: 96000, noise: 900000, swing: 0.1, period: 12 })),
  monthlyMargin: zip(m24, walk({ seed: 60, count: 24, start: 31, drift: 0.42, noise: 5.5, swing: 0.08, period: 12, decimals: 1 })),
  yearRevenue: zip(y7, [8.2e6, 12.6e6, 21.4e6, 34.8e6, 29.6e6, 47.2e6, 63.5e6]),
  yearProfit: zip(y7, [1.1e6, 2.8e6, 6.2e6, 12.1e6, 7.4e6, 16.8e6, 24.3e6]),
  aum: zip(m36, walk({ seed: 61, count: 36, start: 180e6, drift: 14e6, noise: 46e6, swing: 0.06, period: 12 })),
};

// Users
export const users = {
  dau: zip(d120, walk({ seed: 71, count: 120, start: 38000, drift: 190, noise: 5200, swing: 0.12 })),
  wau: zip(d120, walk({ seed: 72, count: 120, start: 129000, drift: 520, noise: 9800, swing: 0.06 })),
  mau: zip(d120, walk({ seed: 73, count: 120, start: 386000, drift: 1240, noise: 16000, swing: 0.03 })),
  signups: zip(d120, walk({ seed: 74, count: 120, start: 2400, drift: 14, noise: 900, swing: 0.24 })),
  kycRate: zip(d120, walk({ seed: 75, count: 120, start: 62, drift: 0.06, noise: 9, swing: 0.05, min: 20, decimals: 1 })),
  retention: {
    d1: zip(m24, walk({ seed: 76, count: 24, start: 54, drift: 0.5, noise: 5, swing: 0.05, period: 12, decimals: 1 })),
    d7: zip(m24, walk({ seed: 77, count: 24, start: 34, drift: 0.34, noise: 4, swing: 0.06, period: 12, decimals: 1 })),
    d30: zip(m24, walk({ seed: 78, count: 24, start: 19, drift: 0.22, noise: 3, swing: 0.07, period: 12, decimals: 1 })),
  },
  activity: (() => {
    const random = mulberry32(79);
    const out = [];
    for (let day = 0; day < 7; day++) {
      for (let hour = 0; hour < 24; hour++) {
        const weekend = day > 4 ? 0.74 : 1;
        const curve =
          Math.exp(-((hour - 15) ** 2) / 42) + 0.42 * Math.exp(-((hour - 9) ** 2) / 16) + 0.18;
        out.push({ x: day * 24 + hour, y: Math.round(curve * 2800 * weekend * (0.82 + random() * 0.36)) });
      }
    }
    return out;
  })(),
  countries: [
    { id: 'tr', name: 'Türkiye', value: 184000 },
    { id: 'br', name: 'Brazil', value: 152000 },
    { id: 'in', name: 'India', value: 131000 },
    { id: 'ng', name: 'Nigeria', value: 96000 },
    { id: 'de', name: 'Germany', value: 74000 },
    { id: 'other', name: 'Other', value: 128000 },
  ],
  devices: [
    { id: 'ios', name: 'iOS', value: 41200 },
    { id: 'android', name: 'Android', value: 52800 },
    { id: 'web', name: 'Web', value: 28400 },
    { id: 'api', name: 'API', value: 12600 },
  ],
};

// Infrastructure, hourly
export const infra = {
  p50: zip(h72, walk({ seed: 81, count: 72, start: 24, noise: 6, swing: 0.16, period: 24, min: 6, decimals: 1 })),
  p95: zip(h72, walk({ seed: 82, count: 72, start: 86, noise: 26, swing: 0.22, period: 24, min: 20, decimals: 1 })),
  p99: zip(h72, walk({ seed: 83, count: 72, start: 210, noise: 90, swing: 0.3, period: 24, min: 40, decimals: 1 })),
  errorRate: zip(h72, walk({ seed: 84, count: 72, start: 0.24, noise: 0.22, swing: 0.4, period: 24, min: 0.01, decimals: 3 })),
  rps: zip(h72, walk({ seed: 85, count: 72, start: 12400, drift: 40, noise: 2600, swing: 0.34, period: 24 })),
  rejected: zip(h72, walk({ seed: 86, count: 72, start: 180, noise: 160, swing: 0.5, period: 24, min: 0 })),
};
