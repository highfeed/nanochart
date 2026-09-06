import { createElement, useEffect, useRef, type CSSProperties, type ReactElement } from 'react';
import { ChartController } from './adapters/controller.js';
import type { Chart } from './core/chart.js';
import type { ChartOptions } from './core/types.js';

export interface NanoChartProps extends ChartOptions {
  className?: string;
  style?: CSSProperties;
  /**
   * Receives the chart once it exists, again whenever an option the chart
   * reads once — an axis, the plugin list, the locale — has it rebuilt, and
   * null when it is torn down.
   */
  onChart?: (chart: Chart | null) => void;
}

/**
 * `<NanoChart series={…} theme={…} />`
 *
 * The chart is created once and then patched, so re-rendering with an
 * unrelated prop change does not restart its animations. Imperative access is
 * through `onChart` rather than a ref, because the thing worth exposing is the
 * chart, not the div it lives in.
 */
export function NanoChart({ className, style, onChart, ...options }: NanoChartProps): ReactElement {
  const host = useRef<HTMLDivElement | null>(null);
  const controller = useRef<ChartController | null>(null);
  const latest = useRef(options);
  latest.current = options;
  const report = useRef(onChart);
  report.current = onChart;

  // Mount and teardown only; option changes go through the effect below.
  useEffect(() => {
    if (!host.current) return;
    const created = new ChartController(host.current, latest.current, (chart) => report.current?.(chart));
    controller.current = created;
    return () => {
      report.current?.(null);
      created.destroy();
      controller.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    controller.current?.update(options);
  });

  return createElement('div', { ref: host, className, style });
}
