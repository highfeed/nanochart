/**
 * A recording stand-in for CanvasRenderingContext2D.
 *
 * `Renderer` is a thin wrapper over Canvas2D, so recording the raw call stream
 * lets tests assert on real drawing geometry ("is there a line vertex at this
 * pixel?") without a headless GPU or native canvas bindings.
 */

export interface Op {
  readonly name: string;
  readonly args: readonly unknown[];
}

const METHODS = [
  'setTransform', 'clearRect', 'fillRect', 'strokeRect', 'save', 'restore',
  'beginPath', 'closePath', 'moveTo', 'lineTo', 'bezierCurveTo', 'quadraticCurveTo',
  'rect', 'roundRect', 'arc', 'arcTo', 'ellipse', 'clip', 'fill', 'stroke',
  'fillText', 'strokeText', 'setLineDash', 'getLineDash', 'translate', 'scale', 'rotate',
  'createLinearGradient', 'createRadialGradient', 'drawImage', 'putImageData',
] as const;

const PROPERTIES = [
  'fillStyle', 'strokeStyle', 'lineWidth', 'lineCap', 'lineJoin', 'miterLimit',
  'font', 'textAlign', 'textBaseline', 'globalAlpha', 'globalCompositeOperation',
  'shadowColor', 'shadowBlur', 'shadowOffsetX', 'shadowOffsetY', 'letterSpacing',
] as const;

/** Average advance width per character, so `measureText` returns something sane. */
const CHAR_WIDTH = 7;

export class MockContext {
  readonly ops: Op[] = [];
  readonly canvas: MockCanvas;

  constructor(canvas: MockCanvas) {
    this.canvas = canvas;
    for (const name of METHODS) {
      (this as Record<string, unknown>)[name] = (...args: unknown[]) => {
        this.ops.push({ name, args });
        if (name === 'getLineDash') return [];
        if (name === 'createLinearGradient' || name === 'createRadialGradient') {
          return { addColorStop() {} };
        }
        return undefined;
      };
    }
    for (const name of PROPERTIES) {
      let value: unknown = '';
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

  measureText(text: string): { width: number } {
    return { width: text.length * CHAR_WIDTH };
  }

  /** Every call of `name`, in order. */
  calls(name: string): Op[] {
    return this.ops.filter((op) => op.name === name);
  }

  /** Vertices of every path-building call, as `[x, y]` pairs. */
  vertices(...names: string[]): [number, number][] {
    const wanted = names.length ? names : ['moveTo', 'lineTo'];
    const out: [number, number][] = [];
    for (const op of this.ops) {
      if (!wanted.includes(op.name)) continue;
      out.push([op.args[0] as number, op.args[1] as number]);
    }
    return out;
  }

  /** Every string passed to `fillText`. */
  texts(): string[] {
    return this.calls('fillText').map((op) => String(op.args[0]));
  }

  clear(): void {
    this.ops.length = 0;
  }
}

export class MockCanvas {
  width = 0;
  height = 0;
  private readonly context: MockContext;

  constructor() {
    this.context = new MockContext(this);
  }

  getContext(kind: string): MockContext | null {
    return kind === '2d' ? this.context : null;
  }
}
