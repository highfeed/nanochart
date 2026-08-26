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
 */
const CORE_LIMIT = 15.5 * 1024;
const FULL_LIMIT = 19 * 1024;

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

/**
 * What a typical chart actually costs.
 *
 * The full bundle carries every series type and plugin; almost nobody imports
 * all of them, and quoting only that number understates how small a line chart
 * is. Measuring a realistic import keeps both figures honest.
 */
const CORE = `
  import { Chart, line, registerSeries, xAxis, yAxis, tooltip } from '${join(process.cwd(), 'src/index.ts')}';
  console.log(Chart, line, registerSeries, xAxis, yAxis, tooltip);
`;

const dir = mkdtempSync(join(tmpdir(), 'nanochart-size-'));
const entry = join(dir, 'core.ts');
writeFileSync(entry, CORE);
const core = await build({
  entryPoints: [entry],
  bundle: true,
  minify: true,
  format: 'esm',
  target: 'es2020',
  legalComments: 'none',
  write: false,
});
const coreGzip = gzipSync(Buffer.from(core.outputFiles[0].contents), { level: 9 }).length;
console.log(
  `${'line chart + axes + tooltip'.padEnd(28)} ${kb(core.outputFiles[0].contents.length).padStart(9)}  gzip ${kb(coreGzip).padStart(9)}`,
);
if (coreGzip > CORE_LIMIT) {
  console.error(`\ncore over budget: ${kb(coreGzip)} gzip > ${kb(CORE_LIMIT)}`);
  process.exitCode = 1;
}
