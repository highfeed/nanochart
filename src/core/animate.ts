export type Easing = (t: number) => number;

export const easeLinear: Easing = (t) => t;
export const easeOutCubic: Easing = (t) => 1 - (1 - t) ** 3;
export const easeInOutCubic: Easing = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
export const easeOutQuint: Easing = (t) => 1 - (1 - t) ** 5;

/** A number that tweens towards its target over time. */
export class Animated {
  private from: number;
  private to: number;
  private start = 0;
  private duration = 0;
  private easing: Easing = easeOutCubic;

  constructor(value: number) {
    this.from = value;
    this.to = value;
  }

  get target(): number {
    return this.to;
  }

  at(now: number): number {
    if (this.duration <= 0) return this.to;
    const t = (now - this.start) / this.duration;
    if (t <= 0) return this.from;
    if (t >= 1) return this.to;
    return this.from + (this.to - this.from) * this.easing(t);
  }

  active(now: number): boolean {
    return this.duration > 0 && now < this.start + this.duration;
  }

  set(value: number, now: number, duration: number, easing: Easing = easeOutCubic): boolean {
    if (value === this.to) return false;
    if (duration <= 0) {
      this.jump(value);
      return true;
    }
    this.from = this.at(now);
    this.to = value;
    this.start = now;
    this.duration = duration;
    this.easing = easing;
    return true;
  }

  jump(value: number): void {
    this.from = value;
    this.to = value;
    this.duration = 0;
  }
}
