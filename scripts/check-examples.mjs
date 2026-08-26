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
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Window } from 'happy-dom';

const root = resolve(import.meta.dirname, '..');
const pages = [
  { html: 'examples/index.html', script: 'examples/app.js' },
  { html: 'examples/crypto.html', script: 'examples/crypto.js' },
];

/** Enough of a Canvas2D to let the renderer run without drawing anything. */
function stubContext() {
  return new Proxy(
    { canvas: null },
    {
      get: (target, key) => {
        if (key === 'measureText') return (text) => ({ width: String(text).length * 7 });
        if (key === 'canvas') return target.canvas;
        return () => {};
      },
      set: () => true,
    },
  );
}

function prepare(window) {
  const { HTMLCanvasElement, HTMLElement } = window;
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
    configurable: true,
    value(kind) {
      return kind === '2d' ? stubContext() : null;
    },
  });
  // happy-dom has no layout, so nothing would ever have a size to draw into.
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 900 });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => 320 });

  const globals = {
    window: window.window,
    document: window.document,
    HTMLElement: window.HTMLElement,
    HTMLCanvasElement: window.HTMLCanvasElement,
    localStorage: window.localStorage,
    requestAnimationFrame: (fn) => setTimeout(() => fn(performance.now()), 0),
    cancelAnimationFrame: (id) => clearTimeout(id),
    ResizeObserver: class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
    Path2D: class {
      moveTo() {}
      lineTo() {}
      rect() {}
      arc() {}
      closePath() {}
    },
  };
  for (const [key, value] of Object.entries(globals)) globalThis[key] = value;
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

  const charts = [...window.document.querySelectorAll('.chart')];
  const blank = charts.filter((el) => !el.querySelector('canvas')).map((el) => el.id || '(unnamed)');

  const ok = errors.length === 0 && blank.length === 0 && charts.length > 0;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${page.html.padEnd(22)} ${charts.length} charts`);
  for (const error of errors) console.error(`       error: ${error}`);
  if (blank.length) console.error(`       no canvas: ${blank.join(', ')}`);
  if (!ok) failures++;

  window.happyDOM?.close?.();
}

if (failures) {
  console.error(`\n${failures} example page(s) broken`);
  process.exit(1);
}
