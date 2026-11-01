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
  /** compute the field at 1/scale resolution and upscale smoothly; overlays stay crisp (default 1) */
  scale?: number;
  /** exponent applied to the normalised log magnitude before it becomes opacity (default 1.4; 1 is linear) */
  gamma?: number;
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
          d[k + 3] = Math.round(235 * Math.pow(t, gamma));
        }
      }
      if (threshold !== undefined) {
        const th = threshold;
        for (let j = 1; j < H - 1; j++) for (let i = 1; i < W - 1; i++) {
          const m = mag[j * W + i];
          if (!(m >= th)) continue;
          if (mag[j * W + i - 1] < th || mag[j * W + i + 1] < th || mag[(j - 1) * W + i] < th || mag[(j + 1) * W + i] < th) {
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
      if (overlay) overlay(ctx, toPx);
    },
  };
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

/** Schematic layer-5 pyramidal cell: apical tuft, apical trunk, triangular soma, basal dendrites and an axon. */
export function drawNeuron(ctx: CanvasRenderingContext2D, toPx: Glow['toPx'], o: NeuronGlyphOpts): void {
  const [sx, sy] = toPx(o.x, o.soma);
  const [tx, ty] = toPx(o.x, o.tuft);
  const L = Math.abs(sy - ty); // apical length in px
  const w = Math.max(5, L * 0.16); // soma half-width
  ctx.save();
  ctx.strokeStyle = o.color ?? '#1a1a1a';
  ctx.fillStyle = 'rgba(252,252,251,0.85)';
  ctx.lineWidth = o.lineWidth ?? 1.6;
  ctx.lineJoin = 'round';
  // apical trunk
  ctx.beginPath(); ctx.moveTo(sx, sy - w); ctx.lineTo(tx, ty); ctx.stroke();
  // tuft: five branches fanning upward
  for (const [dx, dy] of [[-0.55, -0.55], [-0.25, -0.75], [0.05, -0.8], [0.35, -0.65], [0.6, -0.3]]) {
    ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(tx + dx * L * 0.45, ty + dy * L * 0.45); ctx.stroke();
  }
  // soma
  ctx.beginPath(); ctx.moveTo(sx, sy - w); ctx.lineTo(sx - w, sy + w * 0.9); ctx.lineTo(sx + w, sy + w * 0.9); ctx.closePath();
  ctx.fill(); ctx.stroke();
  if (o.full ?? true) {
    // basal dendrites and axon
    ctx.beginPath(); ctx.moveTo(sx - w * 0.5, sy + w * 0.9); ctx.lineTo(sx - w * 1.8, sy + w * 2.6); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(sx + w * 0.5, sy + w * 0.9); ctx.lineTo(sx + w * 1.8, sy + w * 2.6); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(sx, sy + w * 0.9); ctx.lineTo(sx, sy + L * 0.55); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(sx, sy + L * 0.55); ctx.lineTo(sx - w * 1.2, sy + L * 0.55 + w * 1.6); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(sx, sy + L * 0.55); ctx.lineTo(sx + w * 1.2, sy + L * 0.55 + w * 1.6); ctx.stroke();
  }
  ctx.restore();
}

/** Scale bar in the lower-left corner. */
export function scaleBar(ctx: CanvasRenderingContext2D, toPx: Glow['toPx'], x0: number, y0: number, length: number, label: string): void {
  const [ax, ay] = toPx(x0, y0), [bx] = toPx(x0 + length, y0);
  ctx.save();
  ctx.strokeStyle = '#1a1a1a'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, ay); ctx.stroke();
  ctx.fillStyle = '#1a1a1a'; ctx.font = '12px system-ui';
  ctx.fillText(label, ax, ay - 6);
  ctx.restore();
}

/** Legend for the glow colours. */
export function glowLegend(container: HTMLElement, floor: string, ceiling: string, note?: string): void {
  const el = document.createElement('div');
  el.className = 'glow-legend';
  el.innerHTML = `<span class="sw" style="background:linear-gradient(90deg,rgba(42,120,214,0),rgba(42,120,214,0.92))"></span><span>negative</span>
    <span class="sw" style="background:linear-gradient(90deg,rgba(227,73,72,0),rgba(227,73,72,0.92))"></span><span>positive</span>
    <span class="note">faint = ${floor}, solid = ${ceiling}${note ? `; ${note}` : ''}</span>`;
  container.append(el);
}
