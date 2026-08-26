import { gzipSync } from 'node:zlib';
import { readFileSync } from 'node:fs';
import { build } from 'esbuild';

/**
 * gzip budget for the ESM bundle, in bytes. The README quotes this number.
 *
 * Raised from 14 kB when the columnar data layer landed: min/max decimation
 * and gap handling cost about 1.2 kB, and a chart that draws the data it was
 * given is worth more than the kilobyte.
 */
const SIZE_LIMIT = 15 * 1024;

const targets = [
  { format: 'esm', outfile: 'dist/nanochart.js' },
  { format: 'iife', outfile: 'dist/nanochart.global.js', globalName: 'nanochart' },
];

for (const target of targets) {
  await build({
    entryPoints: ['src/index.ts'],
    bundle: true,
    minify: true,
    sourcemap: true,
    target: 'es2020',
    legalComments: 'none',
    ...target,
  });
  const bytes = readFileSync(target.outfile);
  const gzip = gzipSync(bytes, { level: 9 }).length;
  const kb = (value) => `${(value / 1024).toFixed(2)} kB`;
  console.log(`${target.outfile.padEnd(28)} ${kb(bytes.length).padStart(9)}  gzip ${kb(gzip).padStart(9)}`);

  if (target.format === 'esm' && gzip > SIZE_LIMIT) {
    console.error(`\nsize budget exceeded: ${kb(gzip)} gzip > ${kb(SIZE_LIMIT)}`);
    process.exitCode = 1;
  }
}
