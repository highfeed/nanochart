import { beforeAll, describe, expect, it } from 'vitest';
import { contextOf, installCanvas, mount } from './helpers/dom.js';
import { Chart } from '../src/core/chart.js';
import { registerSeries } from '../src/index.js';
import type { Plugin } from '../src/core/types.js';

beforeAll(installCanvas);

/**
 * The font each `fillText` was really drawn with.
 *
 * The recorder does not model `save` and `restore`, and that gap is where the
 * cache went wrong, so the calls are replayed with the context's own rules.
 */
function effectiveFonts(canvas: HTMLCanvasElement): Record<string, string> {
  const stack: string[] = [];
  let font = '';
  const out: Record<string, string> = {};
  for (const op of contextOf(canvas).ops) {
    if (op.name === 'save') stack.push(font);
    else if (op.name === 'restore') font = stack.pop() ?? font;
    else if (op.name === 'set:font') font = String(op.args[0]);
    else if (op.name === 'fillText') out[String(op.args[0])] = font;
  }
  return out;
}

describe('the font cache', () => {
  it('survives a save and a restore around text', () => {
    registerSeries({
      type: 'labelled',
      cartesian: false,
      draw(ctx) {
        ctx.r.save();
        ctx.r.text('series', 10, 10, { font: ctx.font(10, 500), color: '#000' });
        ctx.r.restore();
      },
    });
    const around: Plugin = {
      name: 'around',
      drawUnder(ctx) {
        ctx.r.text('under', 10, 30, { font: ctx.font(13, 500), color: '#000' });
      },
      drawOver(ctx) {
        ctx.r.text('over', 10, 50, { font: ctx.font(10, 500), color: '#000' });
      },
    };
    const host = mount();
    const chart = new Chart(host, {
      animation: false,
      height: 300,
      series: [{ id: 'a', type: 'labelled', data: [1] }],
      plugins: [around],
    });
    chart.render();
    const fonts = effectiveFonts(chart.canvas);
    // The restore put the 13px font back; the cache used to go on believing
    // 10px was set, and skipped setting it for the plugin.
    expect(fonts.series).toBe(chart.font(10, 500));
    expect(fonts.over).toBe(chart.font(10, 500));
    chart.destroy();
  });
});
