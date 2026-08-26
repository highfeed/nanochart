/**
 * Assembles the demo site published to GitHub Pages.
 *
 * The examples live one directory above the bundles during development
 * (`../dist/nanochart.js`); on the site they sit next to them, so the import
 * specifier is rewritten as the files are copied.
 */
import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const OUT = 'site';

await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });

await cp('examples', OUT, { recursive: true });
await cp('dist', join(OUT, 'dist'), { recursive: true });

for (const name of await readdir(OUT)) {
  if (!name.endsWith('.js')) continue;
  const path = join(OUT, name);
  const source = await readFile(path, 'utf8');
  const rewritten = source.replaceAll('../dist/', './dist/');
  if (rewritten !== source) await writeFile(path, rewritten);
}

// Pages serves .nojekyll-less directories through Jekyll, which drops
// files and folders beginning with an underscore.
await writeFile(join(OUT, '.nojekyll'), '');

console.log(`site/ ready — ${(await readdir(OUT)).length} entries at the root`);
