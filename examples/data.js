import { days, walk, zip } from './random.js';

const followersTime = days(126);
export const followers = {
  joined: zip(followersTime, walk({ seed: 7, count: 126, start: 640, drift: 7, noise: 260, swing: 0.16 })),
  left: zip(followersTime, walk({ seed: 23, count: 126, start: 210, drift: 1.6, noise: 130, swing: 0.1 })),
};

const sourcesTime = days(92);
export const sources = {
  search: zip(sourcesTime, walk({ seed: 41, count: 92, start: 1400, drift: 12, noise: 620, swing: 0.2 })),
  channels: zip(sourcesTime, walk({ seed: 59, count: 92, start: 900, drift: 8, noise: 420, swing: 0.24 })),
  groups: zip(sourcesTime, walk({ seed: 71, count: 92, start: 520, drift: 3, noise: 240, swing: 0.18 })),
};

const contentTime = days(90);
export const content = {
  text: zip(contentTime, walk({ seed: 3, count: 90, start: 5200, drift: 14, noise: 900, swing: 0.2 })),
  photos: zip(contentTime, walk({ seed: 13, count: 90, start: 2600, drift: 18, noise: 700, swing: 0.26 })),
  videos: zip(contentTime, walk({ seed: 29, count: 90, start: 1200, drift: 22, noise: 520, swing: 0.3 })),
  files: zip(contentTime, walk({ seed: 37, count: 90, start: 780, drift: 4, noise: 260, swing: 0.14 })),
  voice: zip(contentTime, walk({ seed: 53, count: 90, start: 430, drift: 6, noise: 200, swing: 0.34 })),
};

const messagesTime = days(64);
export const messages = zip(
  messagesTime,
  walk({ seed: 97, count: 64, start: 3400, drift: 26, noise: 1500, swing: 0.28 }),
);

const appsTime = days(84);
export const apps = {
  users: zip(appsTime, walk({ seed: 101, count: 84, start: 1850, drift: 16, noise: 520, swing: 0.12 })),
  revenue: zip(appsTime, walk({ seed: 137, count: 84, start: 24, drift: 0.32, noise: 11, swing: 0.22 })),
};

export const fruits = [
  { id: 'apples', name: 'Apples', value: 3241 },
  { id: 'bananas', name: 'Bananas', value: 2380 },
  { id: 'oranges', name: 'Oranges', value: 1712 },
  { id: 'lemons', name: 'Lemons', value: 1104 },
  { id: 'kiwi', name: 'Kiwi', value: 640 },
];
