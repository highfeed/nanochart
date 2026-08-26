import { defineComponent, h, onBeforeUnmount, onMounted, ref, watch, type PropType } from 'vue';
import { ChartController } from './adapters/controller.js';
import type { ChartOptions } from './core/types.js';

/**
 * `<NanoChart :options="options" />`
 *
 * One `options` prop rather than a prop per chart option: the option set is
 * large and grows, and a wrapper that mirrors it drifts out of date. The
 * controller works out the narrowest update for whatever changed.
 */
export const NanoChart = defineComponent({
  name: 'NanoChart',
  props: {
    options: { type: Object as PropType<ChartOptions>, required: true },
  },
  emits: {
    ready: (chart: ChartController['chart']) => !!chart,
  },
  setup(props, { emit }) {
    const host = ref<HTMLElement | null>(null);
    let controller: ChartController | null = null;

    onMounted(() => {
      if (!host.value) return;
      controller = new ChartController(host.value, props.options);
      emit('ready', controller.chart);
    });

    // Deep, because a caller mutating `options.series` in place is ordinary
    // Vue usage and should still reach the chart.
    watch(
      () => props.options,
      (next) => controller?.update(next),
      { deep: true },
    );

    onBeforeUnmount(() => {
      controller?.destroy();
      controller = null;
    });

    return () => h('div', { ref: host });
  },
});
