import * as d3 from 'd3';

/** Diverging blue–grey–red for signed quantities (palette slots 1 and 8). */
export const diverging = d3.scaleLinear<string>().domain([-1, 0, 1]).range(['#2a78d6', '#f0efec', '#e34948']).interpolate(d3.interpolateRgb).clamp(true);
/** Sequential blue ramp for magnitudes (light → dark). */
export const sequential = d3.scaleLinear<string>().domain([0, 0.5, 1]).range(['#cde2fb', '#3987e5', '#0d366b']).interpolate(d3.interpolateRgb).clamp(true);

export interface HeatmapCfg {
  width: number;
  height: number;
  /** world coordinates of the canvas edges */
  xRange: [number, number];
  yRange: [number, number];
  /** value → colour (input must be normalised by caller) */
  color: (v: number) => string;
}

export interface Heatmap {
  canvas: HTMLCanvasElement;
  /** fill pixels from f(x, y) which returns a normalised value (NaN → transparent) */
  draw(f: (x: number, y: number) => number): void;
  /** overlay drawing in world coordinates */
  overlay(fn: (ctx: CanvasRenderingContext2D, toPx: (x: number, y: number) => [number, number]) => void): void;
}

export function heatmap(container: HTMLElement, cfg: HeatmapCfg): Heatmap {
  const canvas = document.createElement('canvas');
  canvas.className = 'heatmap';
  canvas.width = cfg.width;
  canvas.height = cfg.height;
  container.append(canvas);
  const ctx = canvas.getContext('2d')!;
  const base = ctx.createImageData(cfg.width, cfg.height);
  const cache = new Map<string, [number, number, number]>();
  const rgb = (c: string): [number, number, number] => {
    let v = cache.get(c);
    if (!v) { const o = d3.rgb(c); v = [o.r, o.g, o.b]; cache.set(c, v); }
    return v;
  };
  const toPx = (x: number, y: number): [number, number] => [
    ((x - cfg.xRange[0]) / (cfg.xRange[1] - cfg.xRange[0])) * cfg.width,
    cfg.height - ((y - cfg.yRange[0]) / (cfg.yRange[1] - cfg.yRange[0])) * cfg.height,
  ];
  // quantise colours to 256 levels so the per-pixel cost is a lookup
  const lut: [number, number, number][] = [];
  for (let i = 0; i <= 256; i++) lut.push(rgb(cfg.color(i / 256)));
  let lastOverlay: Parameters<Heatmap['overlay']>[0] | null = null;
  const h: Heatmap = {
    canvas,
    draw(f) {
      const d = base.data;
      for (let j = 0; j < cfg.height; j++) {
        const y = cfg.yRange[1] - ((j + 0.5) / cfg.height) * (cfg.yRange[1] - cfg.yRange[0]);
        for (let i = 0; i < cfg.width; i++) {
          const x = cfg.xRange[0] + ((i + 0.5) / cfg.width) * (cfg.xRange[1] - cfg.xRange[0]);
          const v = f(x, y);
          const k = (j * cfg.width + i) * 4;
          if (Number.isNaN(v)) { d[k + 3] = 0; continue; }
          const c = lut[Math.max(0, Math.min(256, Math.round(v * 256)))];
          d[k] = c[0]; d[k + 1] = c[1]; d[k + 2] = c[2]; d[k + 3] = 255;
        }
      }
      ctx.putImageData(base, 0, 0);
      if (lastOverlay) lastOverlay(ctx, toPx);
    },
    overlay(fn) { lastOverlay = fn; fn(ctx, toPx); },
  };
  return h;
}

/** Colour-bar legend for a heatmap. */
export function colorbar(container: HTMLElement, color: (v: number) => string, labels: [string, string, string]): void {
  const el = document.createElement('div');
  el.className = 'colorbar';
  const stops = Array.from({ length: 11 }, (_, i) => color(i / 10)).join(',');
  el.innerHTML = `<span>${labels[0]}</span><i style="background:linear-gradient(90deg,${stops})"></i><span>${labels[2]}</span>`;
  el.title = labels[1];
  container.append(el);
}
