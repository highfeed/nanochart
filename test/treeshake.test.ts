import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { rollup } from 'rollup';
import { nodeResolve } from '@rollup/plugin-node-resolve';

const root = resolve(__dirname, '..');
const dist = join(root, 'dist', 'index.js');

/**
 * Series renderers register themselves from the top level of `src/index.ts`.
 * A bundler that believes the package is side-effect free will drop those
 * calls, and `Chart` then renders nothing at all — silently, because
 * `drawSeries` uses optional chaining on the missing renderer.
 *
 * Rollup (and therefore `vite build`) does exactly that when `sideEffects`
 * is `false`; esbuild happens not to. Regression for that failure mode.
 */
describe.runIf(existsSync(dist))('tree shaking', () => {
  it('keeps series registration when only Chart is imported', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'nanochart-shake-'));
    const entry = join(dir, 'entry.mjs');
    writeFileSync(
      entry,
      `import { Chart } from ${JSON.stringify(dist)};\n` +
        `import { getSeriesRenderer } from ${JSON.stringify(join(root, 'dist', 'core', 'registry.js'))};\n` +
        `console.log(JSON.stringify({ chart: typeof Chart, line: !!getSeriesRenderer('line') }));\n`,
    );

    const bundle = await rollup({ input: entry, plugins: [nodeResolve()], onwarn: () => {} });
    const { output } = await bundle.generate({ format: 'es' });
    const file = join(dir, 'out.mjs');
    writeFileSync(file, output[0].code);

    // Run in a child process: importing here would go through Vite's resolver.
    const probe = JSON.parse(execFileSync(process.execPath, [file], { encoding: 'utf8' }));
    expect(probe).toEqual({ chart: 'function', line: true });
  });

  it('declares the entry as side-effectful in package.json', () => {
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
    expect(pkg.sideEffects).toContain('./dist/index.js');
  });
});
