import { describe, expect, it, beforeAll } from 'vitest';
import { installCanvas, mount, contextOf } from './helpers/dom.js';
import { Chart } from '../src/core/chart.js';
import { legend, tooltip, xAxis, yAxis } from '../src/index.js';

beforeAll(installCanvas);

describe('test harness', () => {
  it('renders a chart into the recording canvas', () => {
    const host = mount(600, 300);
    const chart = new Chart(host, {
      animation: false,
      height: 300,
      series: [{ id: 'a', type: 'line', name: 'A', data: [1, 5, 2, 8, 3] }],
      plugins: [yAxis(), xAxis(), tooltip(), legend()],
    });
    chart.render();

    const ctx = contextOf(chart.canvas);
    expect(chart.renderer.width).toBe(600);
    expect(chart.renderer.height).toBe(300);
    expect(ctx.calls('stroke').length).toBeGreaterThan(0);
    expect(ctx.vertices('moveTo', 'lineTo').length).toBeGreaterThan(4);
    expect(ctx.texts()).toContain('A');
    chart.destroy();
  });
});
