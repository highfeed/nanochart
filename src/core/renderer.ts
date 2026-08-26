import type { Box } from './types.js';

export type TextAlign = 'left' | 'center' | 'right';
export type TextBaseline = 'top' | 'middle' | 'bottom' | 'alphabetic';

export interface TextStyle {
  font: string;
  color: string;
  align?: TextAlign;
  baseline?: TextBaseline;
  alpha?: number;
}

/** Thin wrapper over Canvas2D: device pixel ratio, crisp lines, cached text metrics. */
export class Renderer {
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  width = 0;
  height = 0;
  dpr = 1;

  private readonly metrics = new Map<string, number>();
  private currentFont = '';

  constructor(canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('nanochart: 2d context is not available');
    this.canvas = canvas;
    this.ctx = ctx;
  }

  resize(width: number, height: number, dpr: number): boolean {
    const w = Math.max(1, Math.round(width));
    const h = Math.max(1, Math.round(height));
    if (this.width === w && this.height === h && this.dpr === dpr) return false;
    this.width = w;
    this.height = h;
    this.dpr = dpr;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    return true;
  }

  begin(background: string): void {
    const { ctx } = this;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.width, this.height);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'butt';
    if (background && background !== 'transparent') {
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, this.width, this.height);
    }
  }

  /** Snaps a coordinate so that a 1px line lands on a whole device pixel. */
  crisp(value: number): number {
    return (Math.round(value * this.dpr) + 0.5) / this.dpr;
  }

  clip(box: Box): void {
    const { ctx } = this;
    ctx.save();
    ctx.beginPath();
    ctx.rect(box.x, box.y, box.w, box.h);
    ctx.clip();
  }

  save(): void {
    this.ctx.save();
  }

  restore(): void {
    this.ctx.restore();
  }

  hline(x0: number, x1: number, y: number, color: string, width = 1): void {
    const { ctx } = this;
    const py = width <= 1 ? this.crisp(y) : y;
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(x0, py);
    ctx.lineTo(x1, py);
    ctx.stroke();
  }

  vline(x: number, y0: number, y1: number, color: string, width = 1): void {
    const { ctx } = this;
    const px = width <= 1 ? this.crisp(x) : x;
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(px, y0);
    ctx.lineTo(px, y1);
    ctx.stroke();
  }

  roundRectPath(x: number, y: number, w: number, h: number, radius: number): void {
    const { ctx } = this;
    const r = Math.min(radius, Math.abs(w) / 2, Math.abs(h) / 2);
    ctx.beginPath();
    if (r <= 0) {
      ctx.rect(x, y, w, h);
      return;
    }
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  fillRoundRect(x: number, y: number, w: number, h: number, radius: number, color: string): void {
    this.roundRectPath(x, y, w, h, radius);
    this.ctx.fillStyle = color;
    this.ctx.fill();
  }

  strokeRoundRect(x: number, y: number, w: number, h: number, radius: number, color: string, width = 1): void {
    this.roundRectPath(x, y, w, h, radius);
    this.ctx.strokeStyle = color;
    this.ctx.lineWidth = width;
    this.ctx.stroke();
  }

  circle(x: number, y: number, radius: number, fill: string, stroke?: string, strokeWidth = 2): void {
    const { ctx } = this;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = fill;
    ctx.fill();
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = strokeWidth;
      ctx.stroke();
    }
  }

  text(value: string, x: number, y: number, style: TextStyle): void {
    const { ctx } = this;
    this.useFont(style.font);
    ctx.textAlign = style.align ?? 'left';
    ctx.textBaseline = style.baseline ?? 'alphabetic';
    ctx.fillStyle = style.color;
    if (style.alpha !== undefined && style.alpha < 1) {
      ctx.globalAlpha = style.alpha;
      ctx.fillText(value, x, y);
      ctx.globalAlpha = 1;
    } else {
      ctx.fillText(value, x, y);
    }
  }

  measure(value: string, font: string): number {
    const key = `${font}\u0000${value}`;
    const cached = this.metrics.get(key);
    if (cached !== undefined) return cached;
    this.useFont(font);
    const width = this.ctx.measureText(value).width;
    if (this.metrics.size > 4096) this.metrics.clear();
    this.metrics.set(key, width);
    return width;
  }

  private useFont(font: string): void {
    if (this.currentFont !== font) {
      this.currentFont = font;
      this.ctx.font = font;
    }
  }
}
