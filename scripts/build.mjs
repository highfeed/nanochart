import { gzipSync } from 'node:zlib';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from 'esbuild';

/**
 * gzip ceilings, in bytes.
 *
 * Ratchets, not targets: they fail the build when the bundle grows without
 * anyone noticing. Raise them deliberately, and update the numbers the readme
 * and the badge quote in the same commit.
 *
 * `CORE_LIMIT` covers what a typical chart imports, which is the figure worth
 * quoting — hardly anyone pulls in all six series types and every plugin.
 * `LEAN_LIMIT` is the same chart through `/core`, `/series` and `/plugins`,
 * which register nothing and so carry only the series type the page draws.
 */
const CORE_LIMIT = 15.75 * 1024;
const FULL_LIMIT = 19.4 * 1024;
const LEAN_LIMIT = 13.7 * 1024;

const kb = (value) => `${(value / 1024).toFixed(2)} kB`;

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
    // The sources are published alongside dist, so embedding a second copy of
    // every file in each bundle map only inflates the package.
    sourcesContent: false,
    target: 'es2020',
    legalComments: 'none',
    ...target,
  });
  const bytes = readFileSync(target.outfile);
  const gzip = gzipSync(bytes, { level: 9 }).length;
  console.log(`${target.outfile.padEnd(28)} ${kb(bytes.length).padStart(9)}  gzip ${kb(gzip).padStart(9)}`);

  if (target.format === 'esm' && gzip > FULL_LIMIT) {
    console.error(`\nfull bundle over budget: ${kb(gzip)} gzip > ${kb(FULL_LIMIT)}`);
    process.exitCode = 1;
  }
}

const dir = mkdtempSync(join(tmpdir(), 'nanochart-size-'));
// From `dist`, the files a bundler sees: `sideEffects` in package.json names
// `dist/index.js` and nothing under `src`, so bundled from the sources esbuild
// takes the entry for side-effect free and drops the series registration it
// exists for, which understates what a page importing the package gets.
const dist = (file) => join(process.cwd(), 'dist', file);

/** Size of a bundle built from `source` the way a user's bundler would build it. */
async function measure(name, source) {
  const entry = join(dir, `${name}.ts`);
  writeFileSync(entry, source);
  const out = await build({
    entryPoints: [entry],
    bundle: true,
    minify: true,
    format: 'esm',
    target: 'es2020',
    legalComments: 'none',
    write: false,
  });
  const bytes = out.outputFiles[0].contents;
  return { bytes: bytes.length, gzip: gzipSync(Buffer.from(bytes), { level: 9 }).length };
}

function report(label, size, limit, name) {
  console.log(`${label.padEnd(28)} ${kb(size.bytes).padStart(9)}  gzip ${kb(size.gzip).padStart(9)}`);
  if (size.gzip > limit) {
    console.error(`\n${name} over budget: ${kb(size.gzip)} gzip > ${kb(limit)}`);
    process.exitCode = 1;
  }
}

/**
 * What a typical chart actually costs.
 *
 * The full bundle carries every series type and plugin; almost nobody imports
 * all of them, and quoting only that number understates how small a line chart
 * is. Measuring a realistic import keeps both figures honest.
 */
report(
  'line chart + axes + tooltip',
  await measure(
    'core',
    `
    import { Chart, line, registerSeries, xAxis, yAxis, tooltip } from '${dist('index.js')}';
    console.log(Chart, line, registerSeries, xAxis, yAxis, tooltip);
  `,
  ),
  CORE_LIMIT,
  'core',
);

/**
 * The same chart through the lean entries, which register nothing, so the five
 * series types the page does not draw are not in it.
 */
report(
  'same, via the lean entries',
  await measure(
    'lean',
    `
    import { Chart, registerSeries } from '${dist('core.js')}';
    import { line } from '${dist('series.js')}';
    import { tooltip, xAxis, yAxis } from '${dist('plugins.js')}';
    registerSeries(line);
    console.log(Chart, xAxis, yAxis, tooltip);
  `,
  ),
  LEAN_LIMIT,
  'lean',
);
