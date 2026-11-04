import { claimCite as c, P } from '../data/params';
import { fmt } from '../ui/slider';
import { section, figure, prose, assumptions } from '../ui/layout';
import { CANVAS_FONT } from '../ui/field';
import { state, subscribe, dimControls, patchPattern, miniValues, scalpValue, MOTOR, patchColour, visible, inHead, R, x0, y0, ax, by, sigmaMm, nCh, nSrc, G, miniIn, POS, NEG } from './dim-model';
import { headGeometry, titledCanvas, footnote, drawCortex } from './head-view';

const W = 360, H = 360, FOOT = 46; // the head view, with a band of notes under it
const geo = headGeometry(W, H);
const { cx, cy, s, elXY } = geo;
const FLOOR = 0.1, CEIL = 50; // µV: the colour scale of the summed map
const RED = '#e34948', BLUE = '#2a78d6';
export function mountBlur(root: HTMLElement) {
  const sec = section(root, 'blur', '4', 'From outside, patches of cortex blur into broad blobs', 'A snapshot of voltage across the scalp: each patch contributes, and their voltages add together');
  prose(sec.text, `
<p>The skull smears every source into a blob several centimetres wide ${c('spatial-lowpass')}, so two
patches closer than a few centimetres, or one nested inside another, produce scalp patterns that look
nearly the same from outside ${c('svd-method')}. A well-studied way to change these signals deliberately is to
imagine moving a body part: the hands, the feet and the tongue are the four motor-imagery classes used in brain–computer
interface (BCI) competitions ${c('mi-classes')}. Their cortical areas are not spread evenly: the hand areas
sit on a knob of the precentral gyrus either side of the midline, the foot areas next to the midline, and the
mouth areas low on the side of the head ${c('motor-map')}. The areas differ in size, the hand and mouth
areas far larger than the foot area ${c('area-sizes')}, and each can carry its own rhythm, strongest while the
area idles and fading when its body part moves or the movement is imagined ${c('own-rhythm')}; section 9 is
about that fading. The figure gives all five patches one radius, so that only their position differs. The maps below are snapshots of one instant.
One fixed patch oscillating around zero keeps its scalp pattern while its voltages reverse sign.
Different patches can have different timing, so their combined map can change shape ${c('rhythm-snapshot')}.
This model treats conduction through the head as effectively instantaneous ${c('quasistatic')}, so faster rhythms such as gamma
reach the scalp in principle; they are smaller, and muscle activity occupies the same 20 to 300 Hz band
${c('emg-level')}, which is why scalp gamma is hard to trust.</p>
<p>The figure places patches on a real head, the fsaverage template with a three-layer boundary-element
model and 128 electrodes ${c('fsaverage-bem')}${c('mne-bem')}${c('montages')}. Each patch is N cells with a
fraction in step, the source of sections 2 and 3, spread over a disc. The patches are a representative set,
the motor areas for the hands, the feet and the tongue. The middle map
shows each patch alone from outside; the right map shows all of them together, which is the only thing
the electrodes ever see. Noise comes in section 7, and section 9 asks what can be controlled.</p>`);

  const fig = figure(sec.fig, `Left: the cortex from above, nose up, with a fixed, representative set of patches on the motor areas a person can modulate at will: the hands, the feet and the tongue ${c('mi-classes')}${c('motor-map')}. Middle: the scalp voltage each patch makes on its own, each map scaled to its own peak, so the shapes can be compared. Right: the voltage of all patches together, on a fixed scale.`, { wide: true });
  const row = document.createElement('div');
  row.className = 'viz-row';
  row.style.flexWrap = 'nowrap';
  fig.viz.append(row);
  const cortex = titledCanvas(row, 'Patch locations on the cortex (view from above)', W, H + FOOT);
  const each = titledCanvas(row, 'Scalp potential of each patch alone', W, H + FOOT);
  const summed = titledCanvas(row, 'Scalp potential of all patches together', W, H + FOOT);
  const cctx = cortex.getContext('2d')!, ectx = each.getContext('2d')!, sctx = summed.getContext('2d')!;
  const mini = document.createElement('canvas'); mini.width = G; mini.height = G;
  const mctx = mini.getContext('2d')!, mimg = mctx.createImageData(G, G);
  const half = document.createElement('canvas'); half.width = W / 2; half.height = H / 2;
  const hctx = half.getContext('2d')!, himg = hctx.createImageData(half.width, half.height);
  fig.panel.append(dimControls());
  assumptions(fig.el, [
    { what: 'Head', value: `fsaverage three-layer BEM (0.3 / 0.006 / 0.3 S/m), ${nSrc.toLocaleString('en-US')} cortical sources with dipoles normal to the cortex, BioSemi-128 electrodes, average reference`, cite: c('fsaverage-bem') + c('mne-bem') + c('montages') },
    { what: 'A patch', value: `N cells with a fraction in step (N × fraction × ${P.singleCellMomentPAm} pA·m plus the √N random part, as in sections 2 and 3), shared equally by all cortical sources within the radius of a centre point; a disc of the default radius holds about ${fmt(Math.PI * 100 * P.neuronsPerMm2 / 1e6, 2)} million cells, so N is a small fraction of them; overlapping patches are separate sources`, cite: c('single-cell-moment') + c('variances-add') + c('neuron-density') },
    { what: 'Drawing', value: `view from above; only cortex and electrodes above the centre of a sphere fitted to the electrodes (radius ${fmt(R / 10, 3)} cm) are drawn, and the outline is the widest extent of those electrodes; scalp maps are a Gaussian-weighted average of all ${nCh} electrode values (width ${fmt(sigmaMm, 2)} mm) on that sphere; the summed map fades from ${FLOOR} µV to solid at ${CEIL} µV on a log scale, the single-patch maps are each scaled to their own peak; patch discs are drawn at the patch radius`, cite: '<span class="assumption-tag">drawing</span>' },
  ]);

  function drawCortexView() {
    cctx.clearRect(0, 0, W, H + FOOT);
    footnote(cctx, H, [['five representative local groups of cortical cells,'], ['placed on motor areas a person can modulate at will'], [`each patch: ${fmt(Math.round(state.N), 2)} cells, ${fmt(state.f, 2)} in step, over ${state.radiusMm} mm`]]);
    drawCortex(cctx, geo, state.patches);
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
    footnote(ectx, H, [[{ sw: RED }, 'positive voltage, ', { sw: BLUE }, 'negative'], ['each map is scaled to its own peak, to compare shapes'], ['one fixed patch can reverse this pattern as it oscillates']]);
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
      ectx.fillText(`patch ${k + 1}`, ox, oy + ry + 14);
      ectx.fillStyle = '#52514e'; ectx.fillText(`peak ${fmt(vmax, 2)} µV`, ox, oy + ry + 28);
    });
  }

  /** the scalp voltage of all patches together, on an absolute log colour scale, with a colour bar */
  function drawSummed(total: Float64Array, peak: number) {
    sctx.clearRect(0, 0, W, H + FOOT);
    footnote(sctx, H, [[{ sw: RED }, 'above the average of all 128 electrodes, ', { sw: BLUE }, 'below it'], ['patches with different timing can change the shape'], [`signal peak ${fmt(peak, 2)} µV at the strongest electrode`]]);
    const hw = half.width, hh = half.height, d = himg.data, lf = Math.log10(FLOOR), lc = Math.log10(CEIL);
    for (let j = 0; j < hh; j++) for (let i = 0; i < hw; i++) {
      const k = (j * hw + i) * 4, px = (i + 0.5) * 2, py = (j + 0.5) * 2;
      const x = x0 + (px - cx) / s, y = y0 - (py - cy) / s;
      if (!inHead(x, y)) { d[k + 3] = 0; continue; }
      const v = scalpValue(total, x, y);
      const t = Math.max(0, Math.min(1, (Math.log10(Math.max(Math.abs(v), 1e-30)) - lf) / (lc - lf)));
      const col = v >= 0 ? POS : NEG;
      d[k] = col[0]; d[k + 1] = col[1]; d[k + 2] = col[2]; d[k + 3] = Math.round(235 * t);
    }
    hctx.putImageData(himg, 0, 0);
    sctx.save(); geo.headPath(sctx); sctx.clip(); sctx.imageSmoothingEnabled = true; sctx.drawImage(half, 0, 0, W, H); sctx.restore();
    geo.grid(sctx);
    sctx.fillStyle = 'rgba(26,26,26,0.7)';
    for (const [x, y, z] of elXY) { if (!visible(z)) continue; sctx.beginPath(); sctx.arc(x, y, 2, 0, 2 * Math.PI); sctx.fill(); }
    geo.outline(sctx);
    // colour bar: positive up, negative down
    const bx = W - 28, bt = 48, bb = H - 44, bw = 12;
    for (let y = bt; y < bb; y++) {
      const u = 1 - 2 * (y - bt) / (bb - bt); // +1 at the top, −1 at the bottom
      const v = Math.sign(u) * Math.pow(10, lf + Math.abs(u) * (lc - lf));
      const t = Math.abs(u), col = v >= 0 ? POS : NEG;
      sctx.fillStyle = `rgba(${col[0]},${col[1]},${col[2]},${(235 * t) / 255})`;
      sctx.fillRect(bx, y, bw, 1);
    }
    sctx.strokeStyle = '#898781'; sctx.lineWidth = 1; sctx.strokeRect(bx, bt, bw, bb - bt);
    sctx.fillStyle = '#1a1a1a'; sctx.font = 'bold 12px system-ui, sans-serif'; sctx.textAlign = 'right';
    sctx.fillText(`+${CEIL} µV positive`, bx + bw, bt - 6); sctx.fillText(`−${CEIL} µV negative`, bx + bw, bb + 14);
    sctx.font = '12px system-ui, sans-serif'; sctx.textAlign = 'left'; sctx.fillText('0', bx + bw + 3, (bt + bb) / 2 + 4);

  }

  function update() {
    const pats = state.patches.map(patchPattern);
    const total = new Float64Array(nCh);
    for (const p of pats) for (let ch = 0; ch < nCh; ch++) total[ch] += p.a[ch];
    const peak = Math.max(0, ...Array.from(total, Math.abs));
    drawCortexView();
    drawEach(pats);
    drawSummed(total, peak);
  }
  subscribe(update);
  state.patches = MOTOR();
  update();
}
