import { claimCite as c, P } from '../data/params';
import { fmt } from '../ui/slider';
import { section, figure, prose, assumptions } from '../ui/layout';
import { CANVAS_FONT } from '../ui/field';
import { state, subscribe, dimControls, patchPattern, miniValues, scalpValue, MOTOR, patchColor, visible, inHead, R, x0, y0, ax, by, sigmaMm, nCh, nSrc, G, miniIn, POS, NEG } from './dim-model';
import { headGeometry, titledCanvas, footnote, drawCortex } from './head-view';

const W = 360, H = 360, FOOT = 20; // the head view, with room for the sign key under the middle panel
const geo = headGeometry(W, H);
const { cx, cy, s, elXY } = geo;
const FLOOR = 0.1, CEIL = 50; // µV: the color scale of the summed map
const RED = '#e34948', BLUE = '#2a78d6';
export function mountBlur(root: HTMLElement) {
  const sec = section(root, 'blur', '4', 'Patches of cortex blur into broad blobs at the scalp');
  prose(sec.text, `
<p>Each source's voltage is spread over the scalp ${c('spatial-lowpass')}. Nearby patches can
therefore produce similar scalp patterns, making them hard to distinguish ${c('svd-method')}.</p>
<p>The figure uses six illustrative patches in movement-related areas ${c('motor-map')}. Imagining
movement can weaken the local rhythm ${c('own-rhythm')}. Section 9 explores how these changes become commands.</p>
<p>Each patch uses the cell-group model from sections 2 and 3, spread across a disc. All patches share the
selected cell count, fraction in step and radius. This keeps their source strengths comparable while showing
how location changes the scalp pattern ${c('patch-map-model')}.</p>
<p>The calculation uses the public fsaverage anatomical template, which is a digital skull phantom commonly used for modeling neural electrical signals
${c('fsaverage-bem')}. A boundary-element model calculates the scalp voltages ${c('mne-bem')}, sampled
at 128 electrode positions ${c('montages')}. The middle panel isolates each patch and the right panel adds them.
These are snapshots without recording noise. Section 5 follows voltage over time, and section 7 adds noise.</p>`);

  const fig = figure(sec.fig, `Left: the cortex viewed from above, with the nose at the top. The numbered patches are representative groups of cells in movement-related areas ${c('motor-map')}${c('patch-map-model')}. Middle: the scalp voltage from each patch alone. Each small map is scaled to its own peak so you can compare shapes, not their absolute amplitudes. Right: the sum of all patches. Its voltage scale stays fixed as you change the sliders ${c('patch-map-model')}.`, { wide: true });
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
    { what: 'Head model', value: `The fsaverage template uses a three-layer boundary-element model ${c('fsaverage-bem')}${c('mne-bem')}. Conductivities are brain 0.3, skull 0.006 and scalp 0.3 S/m. There are ${nSrc.toLocaleString('en-US')} cortical source locations, with currents perpendicular to the surface.`, cite: c('patch-map-model') },
    { what: 'Electrodes and reference', value: `BioSemi-128 electrode positions ${c('montages')}. Each voltage is measured relative to the average across those electrodes.`, cite: c('patch-map-model') },
    { what: 'A patch', value: `N is the number of cells. Each is assigned ${P.singleCellMomentPAm} pA·m ${c('single-cell-moment')}. The fraction in step adds directly; the rest adds in squared amplitude ${c('variances-add')}. Source locations inside the radius receive equal weights, normalized for their current directions. A limit prevents extreme scaling when directions cancel. Overlapping patches remain separate sources in this calculation.`, cite: c('patch-map-model') },
    { what: 'Cell count versus patch area', value: `At the assumed cell density, a disc of the default radius contains about ${fmt(Math.PI * 100 * P.neuronsPerMm2 / 1e6, 2)} million cells ${c('neuron-density')}. The N slider specifies how many contribute to this modeled source, rather than all cells inside the disc.`, cite: c('patch-map-model') },
    { what: 'Drawing', value: `Only the upper cortex and electrodes are shown. The outline follows the electrode positions on a fitted sphere of radius ${fmt(R / 10, 3)} cm. Smooth maps interpolate the ${nCh} electrode values, giving more weight to closer electrodes (width ${fmt(sigmaMm, 2)} mm). The summed map uses a fixed logarithmic scale from ${FLOOR} to ${CEIL} µV. Individual maps use their own peak scales.`, cite: c('patch-map-model') },
  ]);

  function drawCortexView() {
    cctx.clearRect(0, 0, W, H + FOOT);
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
    footnote(ectx, H, [[{ sw: RED }, 'positive voltage, ', { sw: BLUE }, 'negative']]);
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
      ectx.strokeStyle = patchColor(k); ectx.lineWidth = 2;
      ectx.beginPath(); ectx.ellipse(ox, oy, rx, ry, 0, 0, 2 * Math.PI); ectx.stroke();
      ectx.beginPath(); ectx.moveTo(ox - 5, oy - ry + 1); ectx.lineTo(ox, oy - ry - 6); ectx.lineTo(ox + 5, oy - ry + 1); ectx.stroke();
      ectx.fillStyle = '#1a1a1a'; ectx.textAlign = 'center'; ectx.font = '13px system-ui, sans-serif';
      ectx.fillText(`patch ${k + 1}`, ox, oy + ry + 14);
      ectx.fillStyle = '#52514e'; ectx.fillText(`peak ${fmt(vmax, 2)} µV`, ox, oy + ry + 28);
    });
  }

  /** the scalp voltage of all patches together, on an absolute log color scale, with a color bar */
  function drawSummed(total: Float64Array) {
    sctx.clearRect(0, 0, W, H + FOOT);
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
    // color bar: positive up, negative down
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
    drawCortexView();
    drawEach(pats);
    drawSummed(total);
  }
  subscribe(update);
  state.patches = MOTOR();
  update();
}
