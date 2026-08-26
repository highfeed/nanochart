import { MockContext } from './mock-canvas.js';

/** Records the same path calls as MockContext, for `fill(path)` style drawing. */
class MockPath2D {
  readonly ops: { name: string; args: unknown[] }[] = [];
  moveTo(...args: unknown[]) { this.ops.push({ name: 'moveTo', args }); }
  lineTo(...args: unknown[]) { this.ops.push({ name: 'lineTo', args }); }
  rect(...args: unknown[]) { this.ops.push({ name: 'rect', args }); }
  arc(...args: unknown[]) { this.ops.push({ name: 'arc', args }); }
  closePath() { this.ops.push({ name: 'closePath', args: [] }); }
}

const contexts = new WeakMap<HTMLCanvasElement, MockContext>();

/** Installs canvas, Path2D and ResizeObserver stubs. Call once per test file. */
export function installCanvas(): void {
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
    configurable: true,
    value(this: HTMLCanvasElement, kind: string) {
      if (kind !== '2d') return null;
      let ctx = contexts.get(this);
      if (!ctx) {
        ctx = new MockContext({ width: 0, height: 0 } as never);
        contexts.set(this, ctx);
      }
      return ctx;
    },
  });

  // happy-dom reports 0 for layout boxes; derive them from the inline style so
  // that resize() sees what a browser would see.
  Object.defineProperty(HTMLCanvasElement.prototype, 'clientHeight', {
    configurable: true,
    get(this: HTMLCanvasElement) {
      return Number.parseFloat(this.style.height) || 0;
    },
  });
  Object.defineProperty(HTMLCanvasElement.prototype, 'clientWidth', {
    configurable: true,
    get(this: HTMLCanvasElement) {
      return Number.parseFloat(this.style.width) || this.parentElement?.clientWidth || 0;
    },
  });

  (globalThis as Record<string, unknown>).Path2D = MockPath2D;

  if (typeof globalThis.ResizeObserver === 'undefined') {
    (globalThis as Record<string, unknown>).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
}

/** The recorder behind a chart's canvas. */
export function contextOf(canvas: HTMLCanvasElement): MockContext {
  const ctx = contexts.get(canvas);
  if (!ctx) throw new Error('test: canvas has no mock context');
  return ctx;
}

/**
 * A detached container with a real layout size.
 * happy-dom reports 0 for clientWidth/clientHeight, so they are stubbed.
 */
export function mount(width = 600, height = 300): HTMLElement {
  const host = document.createElement('div');
  Object.defineProperty(host, 'clientWidth', { configurable: true, value: width });
  Object.defineProperty(host, 'clientHeight', { configurable: true, value: height });
  document.body.appendChild(host);
  return host;
}

/** Sets the size a container reports, the way a real layout change would. */
export function setSize(host: HTMLElement, width: number, height: number): void {
  Object.defineProperty(host, 'clientWidth', { configurable: true, value: width });
  Object.defineProperty(host, 'clientHeight', { configurable: true, value: height });
}
