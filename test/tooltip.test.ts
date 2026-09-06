import { beforeAll, describe, expect, it } from 'vitest';
import { drawOnce, installCanvas, mount } from './helpers/dom.js';
import { Chart } from '../src/core/chart.js';
import { tooltip, type TooltipOptions } from '../src/index.js';

beforeAll(installCanvas);

/** Everything the card prints with the pointer over the middle sample. */
function cardTexts(options: TooltipOptions): string[] {
  const host = mount(600, 300);
  const chart = new Chart(host, {
    animation: false,
    height: 300,
    padding: { left: 0, right: 0, top: 0, bottom: 0 },
    series: [
      { id: 'a', type: 'line', name: 'A', data: [10, 20, 30] },
      { id: 'b', type: 'line', name: 'B', data: [1, 2, 3] },
    ],
    plugins: [tooltip(options)],
  });
  chart.render();
  (chart as never as { updateHover(s: unknown): void }).updateHover({
    type: 'move', x: 300, y: 150, inside: true, originalEvent: null,
  });
  const texts = drawOnce(chart).texts();
  chart.destroy();
  return texts;
}

describe('the total row', () => {
  it('is formatted like the rows', () => {
    // "$820" on every row and a bare "820" on the total read as a mistake in
    // the data, and the examples showed exactly that.
    const texts = cardTexts({ total: true, format: (value) => `$${value}` });
    expect(texts).toContain('$20');
    expect(texts).toContain('$22');
    expect(texts).not.toContain('22');
  });

  it('takes its own formatter when given one', () => {
    const texts = cardTexts({
      total: true,
      format: (value) => `$${value}`,
      formatTotal: (total) => `${total} in all`,
    });
    expect(texts).toContain('22 in all');
  });

  it('falls back to the locale number', () => {
    expect(cardTexts({ total: true })).toContain('22');
  });
});
