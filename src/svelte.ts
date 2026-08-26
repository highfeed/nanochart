import { ChartController } from './adapters/controller.js';
import type { ChartOptions } from './core/types.js';

export interface ChartAction {
  update(options: ChartOptions): void;
  destroy(): void;
}

/**
 * Svelte action: `<div use:nanochart={options} />`.
 *
 * An action is already the right shape for this — an element, an update hook
 * and a teardown — so there is no component to wrap it in.
 */
export function nanochart(node: HTMLElement, options: ChartOptions): ChartAction {
  const controller = new ChartController(node, options);
  return {
    update: (next) => controller.update(next),
    destroy: () => controller.destroy(),
  };
}

export { ChartController } from './adapters/controller.js';
