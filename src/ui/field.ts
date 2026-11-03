/**
 * Diagrammatic field rendering: a signed potential drawn as a soft glow (red positive, blue negative,
 * opacity following the logarithm of the magnitude) with an optional contour at a detection threshold,
 * plus a schematic pyramidal-neuron glyph drawn in world coordinates.
 */

export interface GlowCfg {
  width: number;
  height: number;
  /** world coordinates of the canvas edges (any unit, used consistently) */
  xRange: [number, number];
  yRange: [number, number];
  /** |V| at which the glow becomes fully transparent */
  floor: number;
  /** |V| at which the glow saturates */
  ceiling: number;
  /** draw a contour where |V| crosses this value (same unit as V) */
  threshold?: number;
  /** draw the contour only where this returns true (default everywhere) */
  contourWhere?: (x: number, y: number) => boolean;
  /** opacity multiplier for the glow at a point, 0 to 1 (default 1): fade a region where the field exists but cannot be read */
  fadeWhere?: (x: number, y: number) => number;
  /** compute the field at 1/scale resolution and upscale smoothly; overlays stay crisp (default 1) */
  scale?: number;
  /** exponent applied to the normalised log magnitude before it becomes opacity (default 1.4; 1 is linear) */
  gamma?: number;
  /** grid lines every `step` world units, numbered along the bottom and left edges as value × factor + unit */
  grid?: { step: number; factor: number; unit: string; xTitle?: string; yTitle?: string; labelEvery?: number; note?: string };
}

export interface Glow {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  toPx: (x: number, y: number) => [number, number];
  /** render f(x, y) → signed value; NaN leaves the pixel transparent */
  draw(f: (x: number, y: number) => number, overlay?: (ctx: CanvasRenderingContext2D, toPx: Glow['toPx']) => void): void;
  /** change the contour level (same unit as V); takes effect on the next draw */
  setThreshold(v: number | undefined): void;
}

const POS: [number, number, number] = [227, 73, 72]; // red
const NEG: [number, number, number] = [42, 120, 214]; // blue

export function glow(container: HTMLElement, cfg: GlowCfg): Glow {
  const canvas = document.createElement('canvas');
  canvas.className = 'glow';
  canvas.width = cfg.width;
  canvas.height = cfg.height;
  container.append(canvas);
  const ctx = canvas.getContext('2d')!;
  const scale = cfg.scale ?? 1;
  const W = Math.round(cfg.width / scale), H = Math.round(cfg.height / scale);
  const off = document.createElement('canvas');
  off.width = W; off.height = H;
  const octx = off.getContext('2d')!;
  const img = octx.createImageData(W, H);
  const toPx = (x: number, y: number): [number, number] => [
    ((x - cfg.xRange[0]) / (cfg.xRange[1] - cfg.xRange[0])) * cfg.width,
    cfg.height - ((y - cfg.yRange[0]) / (cfg.yRange[1] - cfg.yRange[0])) * cfg.height,
  ];
  const lf = Math.log10(cfg.floor), lc = Math.log10(cfg.ceiling), gamma = cfg.gamma ?? 1.4;
  let threshold = cfg.threshold;
  return {
    canvas, ctx, toPx,
    setThreshold(v) { threshold = v; },
    draw(f, overlay) {
      const d = img.data;
      const mag = new Float32Array(W * H);
      for (let j = 0; j < H; j++) {
        const y = cfg.yRange[1] - ((j + 0.5) / H) * (cfg.yRange[1] - cfg.yRange[0]);
        for (let i = 0; i < W; i++) {
          const x = cfg.xRange[0] + ((i + 0.5) / W) * (cfg.xRange[1] - cfg.xRange[0]);
          const v = f(x, y);
          const k = (j * W + i) * 4;
          if (Number.isNaN(v)) { d[k + 3] = 0; mag[j * W + i] = NaN; continue; }
          const a = Math.abs(v);
          mag[j * W + i] = a;
          const t = Math.max(0, Math.min(1, (Math.log10(Math.max(a, 1e-30)) - lf) / (lc - lf)));
          const c = v >= 0 ? POS : NEG;
          d[k] = c[0]; d[k + 1] = c[1]; d[k + 2] = c[2];
          d[k + 3] = Math.round(235 * Math.pow(t, gamma) * (cfg.fadeWhere?.(x, y) ?? 1));
        }
      }
      if (threshold !== undefined) {
        const th = threshold;
        for (let j = 1; j < H - 1; j++) for (let i = 1; i < W - 1; i++) {
          const m = mag[j * W + i];
          if (!(m >= th)) continue;
          if (mag[j * W + i - 1] < th || mag[j * W + i + 1] < th || mag[(j - 1) * W + i] < th || mag[(j + 1) * W + i] < th) {
            if (cfg.contourWhere && !cfg.contourWhere(cfg.xRange[0] + ((i + 0.5) / W) * (cfg.xRange[1] - cfg.xRange[0]), cfg.yRange[1] - ((j + 0.5) / H) * (cfg.yRange[1] - cfg.yRange[0]))) continue;
            const k = (j * W + i) * 4;
            d[k] = 20; d[k + 1] = 20; d[k + 2] = 20; d[k + 3] = 255;
          }
        }
      }
      octx.putImageData(img, 0, 0);
      ctx.clearRect(0, 0, cfg.width, cfg.height);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(off, 0, 0, cfg.width, cfg.height);
      if (cfg.grid) drawGrid(ctx, toPx, cfg);
      if (overlay) overlay(ctx, toPx);
    },
  };
}

export const CANVAS_FONT = '14px system-ui, sans-serif';

export type TextPart = string | { sw: string };
/** Draw a line of text in which colour swatches stand in for colour names; returns the x where it ends. */
export function textWithSwatches(ctx: CanvasRenderingContext2D, parts: TextPart[], x: number, y: number, size = 12): number {
  ctx.save(); ctx.textAlign = 'left';
  for (const p of parts) {
    if (typeof p === 'string') { ctx.fillText(p, x, y); x += ctx.measureText(p).width; }
    else { const f = ctx.fillStyle; ctx.fillStyle = p.sw; ctx.fillRect(x + 1, y - size + 1, size - 1, size - 1); ctx.fillStyle = f; x += size + 4; }
  }
  ctx.restore();
  return x;
}
/** width of such a line in the current font */
export function partsWidth(ctx: CanvasRenderingContext2D, parts: TextPart[], size = 12): number {
  return parts.reduce((w, p) => w + (typeof p === 'string' ? ctx.measureText(p).width : size + 4), 0);
}

/** Faint grid with numbered ticks so the scale of a field drawing is explicit. */
function drawGrid(ctx: CanvasRenderingContext2D, toPx: Glow['toPx'], cfg: GlowCfg): void {
  const g = cfg.grid!;
  const fmtTick = (v: number) => {
    const t = v * g.factor;
    const r = Math.round(t * 1000) / 1000;
    return (Object.is(r, -0) ? 0 : r).toString().replace('-', '−');
  };
  ctx.save();
  ctx.font = CANVAS_FONT;
  ctx.strokeStyle = 'rgba(26,26,26,0.16)';
  ctx.lineWidth = 1;
  const x0 = Math.ceil(cfg.xRange[0] / g.step) * g.step, x1 = cfg.xRange[1];
  const y0 = Math.ceil(cfg.yRange[0] / g.step) * g.step, y1 = cfg.yRange[1];
  for (let x = x0; x <= x1 + 1e-12; x += g.step) {
    const [px] = toPx(x, 0);
    ctx.beginPath(); ctx.moveTo(px, 0); ctx.lineTo(px, cfg.height); ctx.stroke();
  }
  for (let y = y0; y <= y1 + 1e-12; y += g.step) {
    const [, py] = toPx(0, y);
    ctx.beginPath(); ctx.moveTo(0, py); ctx.lineTo(cfg.width, py); ctx.stroke();
  }
  // tick numbers: bottom edge for x, left edge for y, with a pale backing so they read over the glow
  ctx.fillStyle = '#52514e';
  const label = (text: string, px: number, py: number, align: CanvasTextAlign) => {
    ctx.textAlign = align;
    const w = ctx.measureText(text).width;
    const lx = align === 'center' ? px - w / 2 : align === 'right' ? px - w : px;
    ctx.fillStyle = 'rgba(252,252,251,0.75)';
    ctx.fillRect(lx - 2, py - 11, w + 4, 14);
    ctx.fillStyle = '#52514e';
    ctx.fillText(text, px, py);
  };
  const every = g.labelEvery ?? 1;
  const isLabelled = (v: number) => Math.abs(Math.round(v / (g.step * every)) * g.step * every - v) < g.step * 1e-6;
  for (let x = x0; x <= x1 + 1e-12; x += g.step) {
    if (!isLabelled(x)) continue;
    const [px] = toPx(x, 0);
    if (px < 24 || px > cfg.width - 24) continue;
    label(fmtTick(x), px, cfg.height - 5, 'center');
  }
  for (let y = y0; y <= y1 + 1e-12; y += g.step) {
    if (!isLabelled(y)) continue;
    const [, py] = toPx(0, y);
    if (py < 14 || py > cfg.height - 22) continue;
    label(fmtTick(y), 4, py + 5, 'left');
  }
  label(g.xTitle ?? g.unit, cfg.width - 4, cfg.height - 5, 'right');
  if (g.yTitle) label(g.yTitle, 4, 16, 'left');
  if (g.note) label(g.note, cfg.width / 2, 16, 'center');
  ctx.restore();
}

/**
 * Shade and label the tissue layers above a cortical cell in a cross-section whose y axis is height above
 * the cell body (metres): grey matter up to the cortical surface, then CSF, dura and skull.
 */
/**
 * The tissue above the cortex as horizontal tinted bands: CSF, dura and skull (sections 1 and 2, the skull
 * running to the top of the picture), or CSF, dura, skull, scalp and air when `skull` and `scalp` are given
 * (section 3). Bands too thin to label are named together at the left, and labels get a white halo.
 */
export function drawCortexLayers(ctx: CanvasRenderingContext2D, toPx: Glow['toPx'], o: { xRange: [number, number]; yTop: number; surface: number; csf: number; dura: number; skull?: number; scalp?: number; greyLabelY?: number }): void {
  const [x0] = toPx(o.xRange[0], 0), [x1] = toPx(o.xRange[1], 0);
  const w = x1 - x0;
  const top = o.surface + o.csf + o.dura;
  const bands: [number, number, string, string][] = [
    [o.surface, o.surface + o.csf, 'rgba(27,175,122,0.14)', 'cerebrospinal fluid (CSF)'],
    [o.surface + o.csf, top, 'rgba(237,161,0,0.22)', 'dura'],
    [top, o.skull ? top + o.skull : o.yTop, 'rgba(137,135,129,0.22)', 'skull'],
  ];
  if (o.skull && o.scalp) bands.push([top + o.skull, top + o.skull + o.scalp, 'rgba(240,201,166,0.5)', 'scalp'], [top + o.skull + o.scalp, o.yTop, 'rgba(0,0,0,0)', 'air']);
  ctx.save();
  ctx.font = CANVAS_FONT;
  const text = (s: string, x: number, y: number, align: CanvasTextAlign) => {
    ctx.textAlign = align; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.strokeText(s, x, y); ctx.fillStyle = '#1a1a1a'; ctx.fillText(s, x, y);
  };
  const thin: string[] = [];
  for (const [a, b, fill, name] of bands) {
    const [, ya] = toPx(0, a), [, yb] = toPx(0, b);
    ctx.fillStyle = fill;
    ctx.fillRect(x0, yb, w, ya - yb);
    if (ya - yb > 16) text(name, x1 - 8, (ya + yb) / 2 + 5, 'right'); else if (b < o.yTop) thin.push(name.replace('cerebrospinal fluid (CSF)', 'CSF')); // a band cut off by the top of the view is not thin
  }
  const [, ys] = toPx(0, o.surface);
  ctx.strokeStyle = 'rgba(26,26,26,0.7)'; ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.moveTo(x0, ys); ctx.lineTo(x1, ys); ctx.stroke();
  if (thin.length) {
    const [, yt] = toPx(0, top);
    text(`${thin.join(' + ')} (thin)`, x0 + 8, yt - 4, 'left');
    text('cortical surface', x1 - 8, ys + 16, 'right');
  } else text('cortical surface', x1 - 8, ys - 6, 'right');
  const [, yg] = toPx(0, o.greyLabelY ?? o.surface * 0.55);
  text('grey matter', x1 - 8, yg, 'right');
  ctx.restore();
}


export interface NeuronGlyphOpts {
  /** horizontal position and vertical position of the soma centre (world units) */
  x: number;
  soma: number;
  /** vertical position of the apical tuft (world units) */
  tuft: number;
  /** stroke colour */
  color?: string;
  lineWidth?: number;
  /** draw basal dendrites and axon below the soma */
  full?: boolean;
}

/**
 * Schematic layer-5 pyramidal cell: apical tuft, apical trunk, triangular soma, basal dendrites and an axon,
 * drawn in white over a dark halo so it stands out on the glow and on the bare background alike.
 */
export function drawNeuron(ctx: CanvasRenderingContext2D, toPx: Glow['toPx'], o: NeuronGlyphOpts): void {
  const [sx, sy] = toPx(o.x, o.soma);
  const [tx, ty] = toPx(o.x, o.tuft);
  const L = Math.abs(sy - ty); // apical length in px
  const w = Math.max(6, L * 0.18); // soma half-width
  const lw = o.lineWidth ?? 2.4;
  const segments: [number, number, number, number][] = [
    [sx, sy - w, tx, ty], // apical trunk
    ...[[-0.55, -0.55], [-0.25, -0.75], [0.05, -0.8], [0.35, -0.65], [0.6, -0.3]].map(([dx, dy]) => [tx, ty, tx + dx * L * 0.45, ty + dy * L * 0.45] as [number, number, number, number]),
  ];
  if (o.full ?? true) {
    segments.push(
      [sx - w * 0.5, sy + w * 0.9, sx - w * 1.8, sy + w * 2.6], [sx + w * 0.5, sy + w * 0.9, sx + w * 1.8, sy + w * 2.6], // basal dendrites
      [sx, sy + w * 0.9, sx, sy + L * 0.55], [sx, sy + L * 0.55, sx - w * 1.2, sy + L * 0.55 + w * 1.6], [sx, sy + L * 0.55, sx + w * 1.2, sy + L * 0.55 + w * 1.6], // axon
    );
  }
  const soma = () => { ctx.beginPath(); ctx.moveTo(sx, sy - w); ctx.lineTo(sx - w, sy + w * 0.9); ctx.lineTo(sx + w, sy + w * 0.9); ctx.closePath(); };
  ctx.save();
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  for (const [stroke, width] of [['rgba(26,26,26,0.6)', lw + 2.2], [o.color ?? '#ffffff', lw]] as [string, number][]) {
    ctx.strokeStyle = stroke; ctx.lineWidth = width;
    for (const [ax, ay, bx, by] of segments) { ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke(); }
    soma(); ctx.stroke();
  }
  ctx.fillStyle = o.color ?? '#ffffff';
  soma(); ctx.fill();
  ctx.restore();
}

/** Scale bar in the lower-left corner. */
export function scaleBar(ctx: CanvasRenderingContext2D, toPx: Glow['toPx'], x0: number, y0: number, length: number, label: string): void {
  const [ax, ay] = toPx(x0, y0), [bx] = toPx(x0 + length, y0);
  ctx.save();
  ctx.strokeStyle = '#1a1a1a'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, ay); ctx.stroke();
  ctx.fillStyle = '#1a1a1a'; ctx.font = CANVAS_FONT;
  ctx.fillText(label, ax, ay - 6);
  ctx.restore();
}

/** Legend for the glow colours. */
/** The legend of a glow, collapsed under a "Legend" toggle. */
export function glowLegend(container: HTMLElement, floor: string, ceiling: string, note?: string): void {
  const el = document.createElement('details');
  el.className = 'legend-toggle';
  el.innerHTML = `<summary>Legend</summary><div class="glow-legend"><span class="sw" style="background:linear-gradient(90deg,rgba(42,120,214,0),rgba(42,120,214,0.92))"></span><span>negative</span>
    <span class="sw" style="background:linear-gradient(90deg,rgba(227,73,72,0),rgba(227,73,72,0.92))"></span><span>positive</span>
    <span class="note">faint = ${floor}, solid = ${ceiling}${note ? `; ${note}` : ''}</span></div>`;
  container.append(el);
}
