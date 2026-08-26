/**
 * A custom plugin, worked through: thresholds and bands.
 *
 * The README gives the shape of a plugin; this is one that does something. A
 * plugin gets the same `DrawContext` the series get, once per frame, so an
 * annotation is placed by the scales of the frame being drawn and painted in
 * the theme's colours at that instant. It follows an animating domain and
 * cross-fades with a theme switch for free — which is the reason to draw one
 * here rather than position a div on top of the canvas.
 */
import { withAlpha } from '../dist/nanochart.js';

const PADDING = 6;

/**
 * @param bands `{ from, to, label, color }` — a window on the x axis.
 * @param lines `{ value, axis, label, color, dash }` — a horizontal threshold.
 */
export function annotate({ bands = [], lines = [] } = {}) {
  return {
    name: 'demo:annotate',

    /** Bands go under the series: they are context for the data, not data. */
    drawUnder(ctx) {
      const { box, r } = ctx;
      for (const band of bands) {
        // Clamped rather than clipped, so a band the window only partly
        // contains still draws its visible half.
        const left = Math.max(box.x, ctx.x.map(band.from));
        const right = Math.min(box.x + box.w, ctx.x.map(band.to));
        if (right <= left) continue;

        const color = band.color ?? ctx.color('textMuted');
        r.fillRoundRect(left, box.y, right - left, box.h, 4, withAlpha(color, 0.12));

        const font = ctx.font(11, 500);
        // A label wider than the band it names would read as someone else's.
        if (!band.label || r.measure(band.label, font) + PADDING * 2 > right - left) continue;
        r.text(band.label, (left + right) / 2, box.y + 10, {
          font,
          color: ctx.color('textMuted'),
          align: 'center',
          baseline: 'middle',
        });
      }
    },

    /** Thresholds go over, or an area fill would swallow the line. */
    drawOver(ctx) {
      const { box, r } = ctx;
      for (const line of lines) {
        const y = ctx.scaleFor(line.axis ?? 'y').map(line.value);
        // The domain animates, and a threshold can sit outside it — while the
        // window moves, or for as long as the data stays well under it.
        if (y < box.y || y > box.y + box.h) continue;
        const color = line.color ?? ctx.color('negative');

        // `Renderer` covers what the built-in plugins need; the raw 2D context
        // is one property away for the rest, dashes included.
        r.save();
        r.ctx.setLineDash(line.dash ?? [5, 4]);
        r.hline(box.x, box.x + box.w, y, color, 1);
        r.restore();

        if (!line.label) continue;
        const font = ctx.font(11, 600);
        const width = r.measure(line.label, font) + PADDING * 2;
        const x = box.x + box.w - width;
        r.fillRoundRect(x, y - 9, width, 18, 5, withAlpha(color, 0.16));
        r.text(line.label, x + PADDING, y, { font, color, baseline: 'middle' });
      }
    },
  };
}
