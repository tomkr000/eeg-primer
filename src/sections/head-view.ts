/** The head seen from above: geometry, grid and outline, and the cortex view with patches (section 4). */
import { CANVAS_FONT, textWithSwatches, type TextPart } from '../ui/field';
import { srcPos, elPos, centre, x0, y0, ax, by, visible, patchColour, type Patch } from './dim-model';

export interface HeadGeo {
  W: number; H: number; cx: number; cy: number; s: number;
  project: (p: number[]) => [number, number, number];
  srcXY: [number, number, number][]; elXY: [number, number, number][];
  headPath: (ctx: CanvasRenderingContext2D) => void;
  grid: (ctx: CanvasRenderingContext2D) => void;
  outline: (ctx: CanvasRenderingContext2D) => void;
}

/** orthographic view from above in a W × H canvas: x right, y (nose) up; z is height above the sphere centre (mm) */
export function headGeometry(W: number, H: number): HeadGeo {
  const cx = W / 2, cy = H / 2 + 4;
  const s = Math.min((W / 2 - 16) / ax, (H / 2 - 24) / by); // px per mm
  const project = (p: number[]): [number, number, number] => [cx + (p[0] - x0) * s, cy - (p[1] - y0) * s, p[2] - centre[2]];
  const headPath = (ctx: CanvasRenderingContext2D) => { ctx.beginPath(); ctx.ellipse(cx, cy, ax * s, by * s, 0, 0, 2 * Math.PI); };
  /** faint 5 cm grid with numbered ticks, in head coordinates about the outline centre */
  const grid = (ctx: CanvasRenderingContext2D) => {
    ctx.save();
    ctx.font = CANVAS_FONT; ctx.strokeStyle = 'rgba(26,26,26,0.16)'; ctx.lineWidth = 1;
    const fmtTick = (mm: number) => String(mm / 10).replace('-', '−');
    for (let mm = -100; mm <= 100; mm += 50) {
      const px = cx + mm * s, py = cy - mm * s;
      ctx.beginPath(); ctx.moveTo(px, 0); ctx.lineTo(px, H); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, py); ctx.lineTo(W, py); ctx.stroke();
    }
    ctx.fillStyle = '#52514e';
    for (let mm = -100; mm <= 100; mm += 50) {
      const px = cx + mm * s, py = cy - mm * s;
      ctx.textAlign = 'center'; ctx.fillText(fmtTick(mm), px, H - 5);
      if (mm !== 0) { ctx.textAlign = 'left'; ctx.fillText(fmtTick(mm), 4, py + 5); }
    }
    ctx.textAlign = 'left'; ctx.fillText('cm', 4, 16);
    ctx.restore();
  };
  const outline = (ctx: CanvasRenderingContext2D) => {
    ctx.save();
    ctx.strokeStyle = '#1a1a1a'; ctx.lineWidth = 1.5;
    headPath(ctx); ctx.stroke();
    const top = cy - by * s, side = ax * s;
    ctx.beginPath(); ctx.moveTo(cx - 10, top + 1); ctx.lineTo(cx, top - 12); ctx.lineTo(cx + 10, top + 1); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(cx - side - 5, cy, 5, 15, 0, 0, 2 * Math.PI); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(cx + side + 5, cy, 5, 15, 0, 0, 2 * Math.PI); ctx.stroke();
    ctx.font = CANVAS_FONT; ctx.fillStyle = '#1a1a1a'; ctx.textAlign = 'center';
    ctx.fillText('front', cx, top - 17); ctx.fillText('back', cx, cy + by * s - 8);
    ctx.restore();
  };
  return { W, H, cx, cy, s, project, srcXY: srcPos.map(project), elXY: elPos.map(project), headPath, grid, outline };
}

/** a titled canvas */
export function titledCanvas(parent: HTMLElement, title: string, w: number, h: number, cls = 'glow'): HTMLCanvasElement {
  const box = document.createElement('div');
  box.className = 'viz-box';
  const t = document.createElement('div'); t.className = 'viz-title'; t.textContent = title;
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h; cv.className = cls; cv.style.width = `${w}px`;
  box.append(t, cv);
  parent.append(box);
  return cv;
}
/** lines of notes in the band under a head view; colours appear as swatches, never as words */
export function footnote(ctx: CanvasRenderingContext2D, top: number, lines: TextPart[][]) {
  ctx.save(); ctx.font = '12px system-ui, sans-serif'; ctx.fillStyle = '#1a1a1a';
  lines.forEach((l, i) => textWithSwatches(ctx, l, 6, top + 13 + i * 15));
  ctx.restore();
}

/** The cortex from above with the patches as coloured, numbered discs. */
export function drawCortex(ctx: CanvasRenderingContext2D, geo: HeadGeo, patches: Patch[]) {
  const { W, H, s, srcXY } = geo;
  ctx.clearRect(0, 0, W, H);
  geo.grid(ctx);
  ctx.fillStyle = 'rgba(26,26,26,0.22)';
  for (const [x, y, z] of srcXY) { if (!visible(z)) continue; ctx.beginPath(); ctx.arc(x, y, 1.3, 0, 2 * Math.PI); ctx.fill(); }
  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  patches.forEach((p, idx) => {
    const [px, py] = srcXY[p.center], r = Math.max(4, p.radiusMm * s);
    const g = ctx.createRadialGradient(px, py, 0, px, py, r), col = patchColour(idx);
    g.addColorStop(0, col + 'e6'); g.addColorStop(0.6, col + '99'); g.addColorStop(1, col + '00');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(px, py, r, 0, 2 * Math.PI); ctx.fill();
  });
  ctx.restore();
  ctx.font = 'bold 14px system-ui, sans-serif'; ctx.fillStyle = '#1a1a1a'; ctx.textAlign = 'center';
  patches.forEach((p, idx) => { const [px, py] = srcXY[p.center]; ctx.fillText(String(idx + 1), px, py + 5); });
  geo.outline(ctx);
}
