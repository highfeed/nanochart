import { ChartController } from './adapters/controller.js';
import type { Chart } from './core/chart.js';
import type { ChartOptions } from './core/types.js';

export interface ChartActionOptions extends ChartOptions {
  /**
   * Receives the chart once it exists, and again whenever an option the chart
   * reads once — an axis, the plugin list — has it rebuilt.
   */
  onChart?: (chart: Chart) => void;
}

export interface ChartAction {
  update(options: ChartActionOptions): void;
  destroy(): void;
}

/** The chart's own options, without the action's callback. */
function strip({ onChart, ...options }: ChartActionOptions): ChartOptions {
  void onChart;
  return options;
}

/**
 * Svelte action: `<div use:nanochart={options} />`.
 *
 * An action is already the right shape for this — an element, an update hook
 * and a teardown — so there is no component to wrap it in.
 */
export function nanochart(node: HTMLElement, options: ChartActionOptions): ChartAction {
  const controller = new ChartController(node, strip(options), options.onChart);
  return {
    update: (next) => controller.update(strip(next)),
    destroy: () => controller.destroy(),
  };
}

export { ChartController } from './adapters/controller.js';
