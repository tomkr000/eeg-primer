import { claimCite as c, P } from '../data/params';
import { fmt } from '../ui/slider';
import { section, figure, prose, assumptions } from '../ui/layout';
import { CANVAS_FONT, textWithSwatches, type TextPart } from '../ui/field';
import { state, subscribe, notify, dimControls, patchPattern, miniValues, scalpValue, MOTOR, patchColour, patchLabel, visible, inHead, srcPos, elPos, centre, R, x0, y0, ax, by, sigmaMm, nCh, nSrc, G, miniIn, POS, NEG, type Patch } from './dim-model';

const W = 360, H = 300, cx = W / 2, cy = H / 2 + 4, FOOT = 32; // the head view, with a band for notes under it
const s = Math.min((W / 2 - 16) / ax, (H / 2 - 24) / by); // px per mm
/** orthographic view from above: x right, y (nose) up; z is height above the sphere centre (mm) */
const project = (p: number[]): [number, number, number] => [cx + (p[0] - x0) * s, cy - (p[1] - y0) * s, p[2] - centre[2]];
const elXY = elPos.map(project), srcXY = srcPos.map(project);
const FLOOR = 0.1, CEIL = 50; // µV: the colour scale of the summed map

function headPath(ctx: CanvasRenderingContext2D) { ctx.beginPath(); ctx.ellipse(cx, cy, ax * s, by * s, 0, 0, 2 * Math.PI); }
/** faint 5 cm grid with numbered ticks, in head coordinates about the outline centre */
function drawGridHead(ctx: CanvasRenderingContext2D) {
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
}
function headOutline(ctx: CanvasRenderingContext2D) {
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
}
/** a titled canvas */
function titledCanvas(parent: HTMLElement, title: string, w: number, h: number, cls = 'glow'): HTMLCanvasElement {
  const box = document.createElement('div');
  box.className = 'viz-box';
  const t = document.createElement('div'); t.className = 'viz-title'; t.textContent = title;
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h; cv.className = cls; cv.style.width = `${w}px`;
  box.append(t, cv);
  parent.append(box);
  return cv;
}
/** one or two lines of notes in the band under the head view; colours appear as swatches, never as words */
function footnote(ctx: CanvasRenderingContext2D, lines: TextPart[][]) {
  ctx.save(); ctx.font = '12px system-ui, sans-serif'; ctx.fillStyle = '#1a1a1a';
  lines.forEach((l, i) => textWithSwatches(ctx, l, 6, H + 13 + i * 15));
  ctx.restore();
}
const RED = '#e34948', BLUE = '#2a78d6';
export function mountBlur(root: HTMLElement) {
  const sec = section(root, 'blur', '6', 'From outside, patches of cortex blur into broad blobs', 'Only a few areas can be controlled at will, and their blobs overlap');
  prose(sec.text, `
<p>The skull smears every source into a blob several centimetres wide ${c('spatial-lowpass')}, so two
patches closer than a few centimetres, or one nested inside another, produce scalp patterns that look
nearly the same from outside ${c('svd-method')}. And a person cannot modulate arbitrary patches of cortex
on demand: what can be modulated at will and still seen from outside are the sensorimotor rhythms of a few
body parts, the hands, the feet and the tongue, the four motor-imagery classes used in brain–computer
interface (BCI) competitions ${c('mi-classes')}. Their cortical areas are not spread evenly: the hand areas
sit on a knob of the precentral gyrus either side of the midline, the foot areas next to the midline, and the
mouth areas low on the side of the head ${c('motor-map')}.</p>
<p>The figure places patches on a real head, the fsaverage template with a three-layer boundary-element
model and 128 electrodes ${c('fsaverage-bem')}${c('mne-bem')}${c('montages')}. Each patch is N cells with a
fraction in step, the source of sections 2 to 5, spread over a disc. The middle map shows each patch alone
from outside; the right map shows all of them together, which is the only thing the electrodes ever see.
Section 7 counts how many of them can be told apart.</p>`);

  const fig = figure(sec.fig, `Left: the cortex from above, nose up, with the patches; the preset puts five on the areas a person can modulate at will ${c('mi-classes')}${c('motor-map')}. Middle: the scalp voltage each patch makes on its own, each map scaled to its own peak, so the shapes can be compared. Right: the voltage of all patches together on a fixed scale, so the sliders show. Voltages are relative to the average of all 128 electrodes, which is defined as zero ${c('montages')}.`, { wide: true });
  const row = document.createElement('div');
  row.className = 'viz-row';
  row.style.flexWrap = 'nowrap';
  fig.viz.append(row);
  const cortex = titledCanvas(row, 'Locations of patches', W, H + FOOT, 'glow head-canvas');
  const each = titledCanvas(row, 'How each patch looks from outside', W, H + FOOT);
  const summed = titledCanvas(row, 'How patches look together', W, H + FOOT);
  const cctx = cortex.getContext('2d')!, ectx = each.getContext('2d')!, sctx = summed.getContext('2d')!;
  const mini = document.createElement('canvas'); mini.width = G; mini.height = G;
  const mctx = mini.getContext('2d')!, mimg = mctx.createImageData(G, G);
  const half = document.createElement('canvas'); half.width = W / 2; half.height = H / 2;
  const hctx = half.getContext('2d')!, himg = hctx.createImageData(half.width, half.height);
  fig.panel.append(dimControls());
  assumptions(fig.el, [
    { what: 'Head', value: `fsaverage three-layer BEM (0.3 / 0.006 / 0.3 S/m), ${nSrc.toLocaleString('en-US')} cortical sources with dipoles normal to the cortex, BioSemi-128 electrodes, average reference`, cite: c('fsaverage-bem') + c('mne-bem') + c('montages') },
    { what: 'A patch', value: `N cells with a fraction in step (N × fraction × ${P.singleCellMomentPAm} pA·m plus the √N random part, as in sections 2 to 5), shared equally by all cortical sources within the radius of a centre point; a disc of the default radius holds about ${fmt(Math.PI * 100 * P.neuronsPerMm2 / 1e6, 2)} million cells, so N is a small fraction of them; overlapping patches are separate sources`, cite: c('single-cell-moment') + c('variances-add') + c('neuron-density') },
    { what: 'Drawing', value: `view from above; only cortex and electrodes above the centre of a sphere fitted to the electrodes (radius ${fmt(R / 10, 3)} cm) are drawn, and the outline is the widest extent of those electrodes; scalp maps are a Gaussian-weighted average of all ${nCh} electrode values (width ${fmt(sigmaMm, 2)} mm) on that sphere; the summed map fades from ${FLOOR} µV to solid at ${CEIL} µV on a log scale, the single-patch maps are each scaled to their own peak; patch discs are drawn at the patch radius`, cite: '<span class="assumption-tag">drawing</span>' },
  ]);

  function drawCortex() {
    cctx.clearRect(0, 0, W, H + FOOT);
    footnote(cctx, [['click to add a patch, click one to remove it'], [`each patch: ${fmt(Math.round(state.N), 2)} cells, ${fmt(state.f, 2)} in step, over ${state.radiusMm} mm`]]);
    drawGridHead(cctx);
    cctx.fillStyle = 'rgba(26,26,26,0.22)';
    for (const [x, y, z] of srcXY) { if (!visible(z)) continue; cctx.beginPath(); cctx.arc(x, y, 1.3, 0, 2 * Math.PI); cctx.fill(); }
    cctx.save();
    cctx.globalCompositeOperation = 'multiply';
    state.patches.forEach((p, idx) => {
      const [px, py] = srcXY[p.center], r = Math.max(4, p.radiusMm * s);
      const g = cctx.createRadialGradient(px, py, 0, px, py, r), col = patchColour(idx);
      g.addColorStop(0, col + 'e6'); g.addColorStop(0.6, col + '99'); g.addColorStop(1, col + '00');
      cctx.fillStyle = g;
      cctx.beginPath(); cctx.arc(px, py, r, 0, 2 * Math.PI); cctx.fill();
    });
    cctx.restore();
    // name labels: below the disc, else above, left or right, wherever they hit neither a disc nor an earlier label
    type Box = [number, number, number, number];
    const taken: Box[] = state.patches.map((p) => { const [px, py] = srcXY[p.center], r = Math.max(4, p.radiusMm * s); return [px - r, px + r, py - r, py + r]; });
    const hits = (b: Box, skip: number) => taken.some((t, i) => i !== skip && b[0] < t[1] && b[1] > t[0] && b[2] < t[3] && b[3] > t[2]);
    state.patches.forEach((p, idx) => {
      const [px, py] = srcXY[p.center];
      cctx.font = 'bold 14px system-ui, sans-serif'; cctx.fillStyle = '#1a1a1a'; cctx.textAlign = 'center';
      cctx.fillText(String(idx + 1), px, py + 5);
      if (!p.name) return;
      const w = p.name.length * 6.5, r = Math.max(4, p.radiusMm * s);
      const spots: [number, number][] = [[px, py + r + 14], [px, py - r - 5], [px - r - w / 2 - 4, py + 5], [px + r + w / 2 + 4, py + 5]];
      const [lx, ly] = spots.find(([x, y]) => !hits([x - w / 2, x + w / 2, y - 12, y], idx)) ?? spots[0];
      taken.push([lx - w / 2, lx + w / 2, ly - 12, ly]);
      cctx.font = '12px system-ui, sans-serif'; cctx.fillText(p.name, lx, ly);
    });
    headOutline(cctx);
    if (!state.patches.length) { cctx.font = CANVAS_FONT; cctx.fillStyle = '#52514e'; cctx.textAlign = 'center'; cctx.fillText('no patches: click to add one', cx, cy); }
  }

  /** the small map of one pattern into the mini canvas, scaled to its own peak */
  function paintMini(a: Float64Array): number {
    const { vals, vmax } = miniValues(a), d = mimg.data;
    for (let g = 0; g < G * G; g++) { const v = vals[g] / vmax, col = v >= 0 ? POS : NEG; d[g * 4] = col[0]; d[g * 4 + 1] = col[1]; d[g * 4 + 2] = col[2]; d[g * 4 + 3] = miniIn[g] ? Math.round(225 * Math.min(1, Math.abs(v))) : 0; }
    mctx.putImageData(mimg, 0, 0);
    return vmax;
  }

  function drawEach(pats: { a: Float64Array }[]) {
    ectx.clearRect(0, 0, W, H + FOOT);
    footnote(ectx, [[{ sw: RED }, 'positive voltage, ', { sw: BLUE }, 'negative'], ['each map is scaled to its own peak, to compare shapes']]);
    ectx.font = CANVAS_FONT; ectx.fillStyle = '#52514e'; ectx.textAlign = 'center';
    if (!pats.length) { ectx.fillText('no patches placed', W / 2, H / 2); return; }
    const cols = Math.ceil(Math.sqrt(pats.length)), rows = Math.ceil(pats.length / cols);
    const cw = W / cols, ch = H / rows;
    pats.forEach((p, k) => {
      const vmax = paintMini(p.a);
      const rx = Math.min(cw / 2 - 6, ((ch - 38) / 2) * ax / by), ry = rx * by / ax;
      const ox = (k % cols) * cw + cw / 2, oy = Math.floor(k / cols) * ch + ry + 6;
      ectx.save(); ectx.beginPath(); ectx.ellipse(ox, oy, rx, ry, 0, 0, 2 * Math.PI); ectx.clip();
      ectx.imageSmoothingEnabled = true; ectx.drawImage(mini, ox - rx, oy - ry, 2 * rx, 2 * ry); ectx.restore();
      ectx.strokeStyle = patchColour(k); ectx.lineWidth = 2;
      ectx.beginPath(); ectx.ellipse(ox, oy, rx, ry, 0, 0, 2 * Math.PI); ectx.stroke();
      ectx.beginPath(); ectx.moveTo(ox - 5, oy - ry + 1); ectx.lineTo(ox, oy - ry - 6); ectx.lineTo(ox + 5, oy - ry + 1); ectx.stroke();
      ectx.fillStyle = '#1a1a1a'; ectx.textAlign = 'center'; ectx.font = '13px system-ui, sans-serif';
      ectx.fillText(patchLabel(state.patches[k], k), ox, oy + ry + 14);
      ectx.fillStyle = '#52514e'; ectx.fillText(`peak ${fmt(vmax, 2)} µV`, ox, oy + ry + 28);
    });
  }

  /** the scalp voltage of all patches together on an absolute log colour scale, with a colour bar and a note on the blue */
  function drawSummed(total: Float64Array) {
    sctx.clearRect(0, 0, W, H + FOOT);
    footnote(sctx, [[{ sw: RED }, 'above the average of all 128 electrodes, ', { sw: BLUE }, 'below it'], ['far from the patches the voltage dips below that average']]);
    let vmax = 0, vmin = 0, minAt: [number, number] = [cx, cy];
    const hw = half.width, hh = half.height, d = himg.data, lf = Math.log10(FLOOR), lc = Math.log10(CEIL);
    for (let j = 0; j < hh; j++) for (let i = 0; i < hw; i++) {
      const k = (j * hw + i) * 4, px = (i + 0.5) * 2, py = (j + 0.5) * 2;
      const x = x0 + (px - cx) / s, y = y0 - (py - cy) / s;
      if (!inHead(x, y)) { d[k + 3] = 0; continue; }
      const v = scalpValue(total, x, y);
      vmax = Math.max(vmax, Math.abs(v));
      if (v < vmin) { vmin = v; minAt = [px, py]; }
      const t = Math.max(0, Math.min(1, (Math.log10(Math.max(Math.abs(v), 1e-30)) - lf) / (lc - lf)));
      const col = v >= 0 ? POS : NEG;
      d[k] = col[0]; d[k + 1] = col[1]; d[k + 2] = col[2]; d[k + 3] = Math.round(235 * t);
    }
    hctx.putImageData(himg, 0, 0);
    sctx.save(); headPath(sctx); sctx.clip(); sctx.imageSmoothingEnabled = true; sctx.drawImage(half, 0, 0, W, H); sctx.restore();
    drawGridHead(sctx);
    sctx.fillStyle = 'rgba(26,26,26,0.7)';
    for (const [x, y, z] of elXY) { if (!visible(z)) continue; sctx.beginPath(); sctx.arc(x, y, 2, 0, 2 * Math.PI); sctx.fill(); }
    headOutline(sctx);
    // colour bar: positive up, negative down, with the noise of one contact marked
    const bx = W - 30, bt = 40, bb = H - 40, bw = 12;
    for (let y = bt; y < bb; y++) {
      const u = 1 - 2 * (y - bt) / (bb - bt); // +1 at the top, −1 at the bottom
      const v = Math.sign(u) * Math.pow(10, lf + Math.abs(u) * (lc - lf));
      const t = Math.abs(u), col = v >= 0 ? POS : NEG;
      sctx.fillStyle = `rgba(${col[0]},${col[1]},${col[2]},${(235 * t) / 255})`;
      sctx.fillRect(bx, y, bw, 1);
    }
    sctx.strokeStyle = '#898781'; sctx.lineWidth = 1; sctx.strokeRect(bx, bt, bw, bb - bt);
    sctx.fillStyle = '#1a1a1a'; sctx.font = '12px system-ui, sans-serif'; sctx.textAlign = 'right';
    sctx.fillText(`+${CEIL} µV`, bx - 4, bt + 4); sctx.fillText('0', bx - 4, (bt + bb) / 2 + 4); sctx.fillText(`−${CEIL} µV`, bx - 4, bb + 4);
    sctx.font = 'bold 12px system-ui, sans-serif'; sctx.fillText('positive', bx - 4, bt + 18); sctx.fillText('negative', bx - 4, bb - 10);
    sctx.font = 'bold 15px system-ui, sans-serif'; sctx.textAlign = 'right';
    sctx.fillText(`peak ${fmt(vmax, 2)} µV`, W - 6, 16);
    sctx.font = '12px system-ui, sans-serif'; sctx.fillStyle = '#52514e';
    sctx.fillText(`noise of one contact ${fmt(state.noiseUv, 2)} µV`, W - 6, 30);
    if (vmin < -FLOOR && minAt[1] > cy + (by * s) / 3) { sctx.strokeStyle = '#1a1a1a'; sctx.lineWidth = 1.2; sctx.beginPath(); sctx.moveTo(minAt[0], minAt[1]); sctx.lineTo(Math.min(minAt[0], 60), H + 4); sctx.stroke(); sctx.fillStyle = '#1a1a1a'; sctx.beginPath(); sctx.arc(minAt[0], minAt[1], 3, 0, 2 * Math.PI); sctx.fill(); }
  }

  function update() {
    const pats = state.patches.map(patchPattern);
    const total = new Float64Array(nCh);
    for (const p of pats) for (let ch = 0; ch < nCh; ch++) total[ch] += p.a[ch];
    drawCortex();
    drawEach(pats);
    drawSummed(total);
  }
  cortex.addEventListener('click', (ev) => {
    const r = cortex.getBoundingClientRect();
    const x = ((ev.clientX - r.left) / r.width) * W, y = ((ev.clientY - r.top) / r.height) * H;
    const hit = state.patches.findIndex((p) => Math.hypot(srcXY[p.center][0] - x, srcXY[p.center][1] - y) < 9);
    if (hit >= 0) { state.patches.splice(hit, 1); notify(); return; }
    let best = -1, bd = Infinity;
    srcXY.forEach(([sx, sy, z], i) => { if (!visible(z)) return; const d = Math.hypot(sx - x, sy - y); if (d < bd) { bd = d; best = i; } });
    if (best >= 0 && bd < 12) { state.patches.push({ center: best, radiusMm: state.radiusMm } as Patch); notify(); }
  });
  subscribe(update);
  state.patches = MOTOR();
  update();
}
