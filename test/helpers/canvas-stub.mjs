/**
 * The browser surface a nanochart needs, stubbed once.
 *
 * Both harnesses that run charts without a browser — the unit tests and
 * `scripts/check-examples.mjs` — need the same things: a Canvas2D that records
 * instead of drawing, a `Path2D`, and a `ResizeObserver` that never fires.
 * They used to stub them separately, so a new Canvas2D call had to be added in
 * two places and the two quietly disagreed about what worked when it was not.
 *
 * Plain `.mjs` so the checker can import it without a build step. What differs
 * between the two — how an element reports its layout size, which globals get
 * rebound — stays with each harness.
 */

/** @typedef {{ name: string, args: unknown[] }} Op */

const METHODS = [
  'setTransform', 'clearRect', 'fillRect', 'strokeRect', 'save', 'restore',
  'beginPath', 'closePath', 'moveTo', 'lineTo', 'bezierCurveTo', 'quadraticCurveTo',
  'rect', 'roundRect', 'arc', 'arcTo', 'ellipse', 'clip', 'fill', 'stroke',
  'fillText', 'strokeText', 'setLineDash', 'getLineDash', 'translate', 'scale', 'rotate',
  'createLinearGradient', 'createRadialGradient', 'drawImage', 'putImageData',
];

const PROPERTIES = [
  'fillStyle', 'strokeStyle', 'lineWidth', 'lineCap', 'lineJoin', 'miterLimit',
  'font', 'textAlign', 'textBaseline', 'globalAlpha', 'globalCompositeOperation',
  'shadowColor', 'shadowBlur', 'shadowOffsetX', 'shadowOffsetY', 'letterSpacing',
];

/** Calls that put something on the screen, as opposed to setting up for it. */
const PAINTS = new Set([
  'fill', 'stroke', 'fillText', 'strokeText', 'fillRect', 'strokeRect',
  'drawImage', 'putImageData',
]);

/** Average advance width per character, so `measureText` returns something sane. */
const CHAR_WIDTH = 7;

/**
 * A recording stand-in for CanvasRenderingContext2D.
 *
 * `Renderer` is a thin wrapper over Canvas2D, so recording the raw call stream
 * lets a test assert on real drawing geometry ("is there a line vertex at this
 * pixel?") without a headless GPU or native canvas bindings — and lets the
 * example checker ask the blunter question of whether a chart drew at all.
 */
export class MockContext {
  /** @type {Op[]} */
  ops = [];

  /** @param {unknown} canvas The element this context belongs to. */
  constructor(canvas) {
    this.canvas = canvas;
    for (const name of METHODS) {
      this[name] = (/** @type {unknown[]} */ ...args) => {
        this.ops.push({ name, args });
        if (name === 'getLineDash') return [];
        if (name === 'createLinearGradient' || name === 'createRadialGradient') {
          return { addColorStop() {} };
        }
        return undefined;
      };
    }
    for (const name of PROPERTIES) {
      /** @type {unknown} */
      let value = '';
      Object.defineProperty(this, name, {
        get: () => value,
        set: (next) => {
          value = next;
          this.ops.push({ name: `set:${name}`, args: [next] });
        },
        configurable: true,
      });
    }
  }

  /** @param {string} text */
  measureText(text) {
    return { width: text.length * CHAR_WIDTH };
  }

  /**
   * Every call of `name`, in order.
   * @param {string} name
   * @returns {Op[]}
   */
  calls(name) {
    return this.ops.filter((op) => op.name === name);
  }

  /**
   * Vertices of every path-building call, as `[x, y]` pairs.
   * @param {...string} names
   * @returns {[number, number][]}
   */
  vertices(...names) {
    const wanted = names.length ? names : ['moveTo', 'lineTo'];
    /** @type {[number, number][]} */
    const out = [];
    for (const op of this.ops) {
      if (!wanted.includes(op.name)) continue;
      out.push([/** @type {number} */ (op.args[0]), /** @type {number} */ (op.args[1])]);
    }
    return out;
  }

  /**
   * Every string passed to `fillText`.
   * @returns {string[]}
   */
  texts() {
    return this.calls('fillText').map((op) => String(op.args[0]));
  }

  /** How many calls actually put pixels down. */
  paints() {
    let count = 0;
    for (const op of this.ops) if (PAINTS.has(op.name)) count++;
    return count;
  }

  clear() {
    this.ops.length = 0;
  }
}

/** Records the same path calls as MockContext, for `fill(path)` style drawing. */
export class MockPath2D {
  /** @type {Op[]} */
  ops = [];
  /** @param {...unknown} args */ moveTo(...args) { this.ops.push({ name: 'moveTo', args }); }
  /** @param {...unknown} args */ lineTo(...args) { this.ops.push({ name: 'lineTo', args }); }
  /** @param {...unknown} args */ rect(...args) { this.ops.push({ name: 'rect', args }); }
  /** @param {...unknown} args */ arc(...args) { this.ops.push({ name: 'arc', args }); }
  closePath() { this.ops.push({ name: 'closePath', args: [] }); }
}

/** A `ResizeObserver` that never fires: neither harness has layout to observe. */
export class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

/** @type {WeakMap<object, MockContext>} */
const contexts = new WeakMap();

/**
 * The recorder behind a canvas, created on first ask.
 * @param {object} canvas
 */
export function contextFor(canvas) {
  let ctx = contexts.get(canvas);
  if (!ctx) {
    ctx = new MockContext(canvas);
    contexts.set(canvas, ctx);
  }
  return ctx;
}

/**
 * The recorder behind a canvas, or null if nothing ever asked for one.
 * @param {object} canvas
 */
export function peekContext(canvas) {
  return contexts.get(canvas) ?? null;
}

/**
 * Points `getContext('2d')` at the recorder, on whichever realm's class is
 * passed — the test globals, or a happy-dom `Window`'s own.
 * @param {{ prototype: object }} canvasClass
 */
export function installGetContext(canvasClass) {
  Object.defineProperty(canvasClass.prototype, 'getContext', {
    configurable: true,
    value(/** @type {string} */ kind) {
      return kind === '2d' ? contextFor(this) : null;
    },
  });
}
