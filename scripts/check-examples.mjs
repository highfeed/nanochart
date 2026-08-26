/**
 * Loads every example page headlessly and fails if anything is broken.
 *
 * The examples import the built library the way a user would, so they are the
 * only place the public API is exercised end to end. A refactor that renames
 * something the examples use — `series.points` becoming `series.data`, say —
 * compiles, passes the unit tests, and silently breaks the demo site. This
 * catches that before it deploys.
 */
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Window } from 'happy-dom';
import {
  installGetContext,
  MockPath2D,
  MockResizeObserver,
  peekContext,
} from '../test/helpers/canvas-stub.mjs';

// `import.meta.dirname` arrived in Node 20.11, and the package declares 18.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pages = [
  { html: 'examples/index.html', script: 'examples/app.js' },
  { html: 'examples/crypto.html', script: 'examples/crypto.js' },
];

function prepare(window) {
  const { HTMLCanvasElement, HTMLElement } = window;
  // The same recording Canvas2D the unit tests run against, so the two
  // harnesses cannot disagree about which calls exist.
  installGetContext(HTMLCanvasElement);
  // happy-dom has no layout, so nothing would ever have a size to draw into.
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 900 });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => 320 });

  const globals = {
    window: window.window,
    document: window.document,
    HTMLElement: window.HTMLElement,
    HTMLCanvasElement: window.HTMLCanvasElement,
    localStorage: window.localStorage,
    // On the page's own timer, not Node's: `happyDOM.close()` cancels these,
    // so a chart still animating cannot wake up after its page is gone and
    // draw into the next one's window.
    requestAnimationFrame: (fn) => window.setTimeout(() => fn(window.performance.now()), 0),
    cancelAnimationFrame: (id) => window.clearTimeout(id),
    ResizeObserver: MockResizeObserver,
    Path2D: MockPath2D,
  };
  for (const [key, value] of Object.entries(globals)) globalThis[key] = value;
}

/**
 * What each `.chart` slot on the page actually drew.
 *
 * A canvas is not evidence of a chart. The defect this check was written for
 * threw inside the `Chart` constructor, so a missing canvas was a fair proxy
 * for it; an empty domain, a renderer producing nothing, or a plugin throwing
 * inside a frame callback all leave the canvas exactly where it was.
 */
function inspect(document) {
  return [...document.querySelectorAll('.chart')].map((element) => {
    const canvas = element.querySelector('canvas');
    const context = canvas ? peekContext(canvas) : null;
    return {
      id: element.id || '(unnamed)',
      canvas: canvas !== null,
      paints: context ? context.paints() : 0,
    };
  });
}

let failures = 0;

for (const page of pages) {
  const html = readFileSync(join(root, page.html), 'utf8');
  const window = new Window({ url: 'http://localhost/' });
  window.document.write(html);
  prepare(window);

  const errors = [];
  window.addEventListener('error', (event) => errors.push(event.message));

  try {
    // Cache-bust so each page gets a fresh module instance.
    await import(`${pathToFileURL(join(root, page.script)).href}?page=${encodeURIComponent(page.html)}`);
  } catch (error) {
    errors.push(`${error.name}: ${error.message}`);
  }

  await new Promise((done) => setTimeout(done, 50));

  const charts = inspect(window.document);
  const missing = charts.filter((chart) => !chart.canvas).map((chart) => chart.id);
  const blank = charts.filter((chart) => chart.canvas && chart.paints === 0).map((chart) => chart.id);
  const paints = charts.reduce((sum, chart) => sum + chart.paints, 0);

  const ok = errors.length === 0 && missing.length === 0 && blank.length === 0 && charts.length > 0;
  const drew = `${charts.length} charts, ${paints.toLocaleString('en-US')} draw calls`;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${page.html.padEnd(22)} ${drew}`);
  for (const error of errors) console.error(`       error: ${error}`);
  if (missing.length) console.error(`       no canvas: ${missing.join(', ')}`);
  if (blank.length) console.error(`       drew nothing: ${blank.join(', ')}`);
  if (!ok) failures++;

  window.happyDOM?.close?.();
}

if (failures) {
  console.error(`\n${failures} example page(s) broken`);
  process.exit(1);
}
