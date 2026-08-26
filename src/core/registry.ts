import type { SeriesRenderer, SeriesType } from './types.js';

const renderers = new Map<string, SeriesRenderer>();

/** Registers a series renderer; custom types become usable as `type: 'my-type'`. */
export function registerSeries(renderer: SeriesRenderer): void {
  renderers.set(renderer.type, renderer);
}

export function getSeriesRenderer(type: SeriesType): SeriesRenderer | undefined {
  return renderers.get(type);
}
