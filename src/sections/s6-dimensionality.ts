import { singularValues, symmetricEigenvalues } from '../physics/linalg';
import { controls, readout, slider, fmt } from '../ui/slider';
import { claimCite as c } from '../data/params';
import { section, figure, prose, assumptions, readouts } from '../ui/layout';
import { CANVAS_FONT } from '../ui/field';
import head from '../data/head-leadfield.json';
import svd from '../data/leadfield-svd.json';

/** Decode the base64 float32 lead field (channels × sources, µV per nA·m). */
function decodeLeadfield(): Float32Array {
  const bin = atob(head.leadfield.float32_base64);
  const buf = new ArrayBuffer(bin.length);
  const u8 = new Uint8Array(buf);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return new Float32Array(buf);
}

interface Patch { center: number; radiusMm: number; }

export function mountDimensionality(root: HTMLElement) {
  const sec = section(root, 'dimensionality', '6', 'How many independent signals can scalp EEG carry?');
  prose(sec.text, `
<p>Think of a synchronous cortical patch as one source. Two patches are two sources; a third population
confined to their overlap is a third source, and it adds a dimension only if its scalp pattern can be told
apart from the other two. The skull blurs every pattern into a smooth blob several centimetres wide
${c('spatial-lowpass')}, so patches that are close together, or nested inside one another, produce nearly
the same pattern and their difference sinks below the noise. The number of usable dimensions is therefore
not the number of patches but the number of distinguishable patterns above the noise, which is a property
of the lead field: its singular values, scaled by source strength and noise ${c('svd-method')}.</p>
<p>The figure lets you place patches on a real head, the fsaverage template with a three-layer
boundary-element model and 128 electrodes ${c('fsaverage-bem')}${c('mne-bem')}${c('montages')}, and counts
how many are separable at the chosen noise. The ceiling, if every point of the cortex were its own source,
is a few dozen with the default settings; adding electrodes beyond the skull’s resolution only samples
the same blur again ${c('spatial-nyquist')}${c('ryynanen')}. For independent sources 21–23 components
carry 99% of the scalp variance on this head ${c('svd-counts')}; Iivanainen et al. find 26 with a
four-compartment model ${c('iivanainen-eigen')}, and blind decomposition of real 71-channel EEG yields about
34 near-dipolar components ${c('ica-dipolar')}.</p>
<p>Time adds bandwidth to each dimension, but what fills it is limited by section 2: only populations of
10⁴–10⁵ synchronous cells register ${c('cells-for-10nam')}, organised by rhythms whose period
scales with the size of the pool ${c('oscillations-synchrony')}. In practice, volitional control from
sensorimotor rhythms has reached three independent dimensions ${c('dof-control')}, the fastest spellers
manage about 5 bits/s by decoding responses to flickering targets chosen by gaze ${c('itr-ssvep')}${c('itr-2002')},
and attempts to read limb trajectories from EEG did not beat chance ${c('kinematics-chance')}. Intracortical
arrays, for comparison, decode handwriting at 90 characters/min and speech at 62 words/min ${c('intracortical')}.</p>`);

  const L = decodeLeadfield();
  const nCh = head.leadfield.shape[0], nSrc = head.leadfield.shape[1];
  const srcPos = head.sources.pos_mm as number[][];
  const elPos = head.electrodes.pos_mm as number[][];

  // sphere fitted to the electrodes (linear least squares) → centre and radius for the top view
  const { centre, R } = fitSphere(elPos);
  const visible = (z: number) => z > 0;
  // the outline is an ellipse round the electrodes that can be seen from above
  const visEl = elPos.filter((p) => visible(p[2] - centre[2]));
  const xs = visEl.map((p) => p[0]), ys = visEl.map((p) => p[1]);
  const x0 = (Math.min(...xs) + Math.max(...xs)) / 2, y0 = (Math.min(...ys) + Math.max(...ys)) / 2;
  const ax = 1.03 * (Math.max(...xs) - Math.min(...xs)) / 2, by = 1.03 * (Math.max(...ys) - Math.min(...ys)) / 2; // mm
  const W = 360, H = 356, cx = W / 2, cy = H / 2 + 4;
  const s = Math.min((W / 2 - 16) / ax, (H / 2 - 24) / by); // px per mm
  /** orthographic view from above: x right, y (nose) up; z is height above the sphere centre (mm) */
  const project = (p: number[]): [number, number, number] => [cx + (p[0] - x0) * s, cy - (p[1] - y0) * s, p[2] - centre[2]];
  const inHead = (x: number, y: number) => ((x - x0) / ax) ** 2 + ((y - y0) / by) ** 2 <= 1;
  const elXY = elPos.map(project);
  const srcXY = srcPos.map(project);
  // interpolation kernel width: a bit under the mean electrode spacing
  let nn = 0;
  for (let i = 0; i < nCh; i++) { let best = Infinity; for (let j = 0; j < nCh; j++) if (j !== i) best = Math.min(best, dist3(elPos[i], elPos[j])); nn += best; }
  const sigmaMm = 0.8 * (nn / nCh);

  const sRadius = slider({ label: 'Patch radius', unit: 'mm', min: 4, max: 30, value: 12, step: 1 });
  const sQ = slider({ label: 'Patch strength (total dipole moment)', unit: 'nA·m', min: 1, max: 100, value: 10, log: true, note: c('cells-for-10nam') });
  const sNoise = slider({ label: 'Noise per electrode', unit: 'µV rms', min: 0.1, max: 10, value: 1, log: true, note: c('skin-noise') });
  const rK = readout('Patches placed');
  const rD = readout('Distinguishable dimensions');
  const rCeil = readout('Ceiling, every cortical point a source');
  const rVar = readout('Components for 99% of the variance', c('svd-counts'));

  const fig = figure(sec.fig, 'A real head (the fsaverage template) from above, nose up. Left: the cortex, each synchronous patch a coloured disc; a third population can live where two discs overlap. Click to add a patch, click a patch to remove it. Right: the scalp potential of all patches together (red positive, blue negative; dots are the electrodes seen from above). The bars rank the independent scalp patterns; each one above the noise line is a dimension a decoder could recover. The ceiling repeats the count with every cortical point as its own source.');
  const row = document.createElement('div');
  row.className = 'viz-row';
  row.style.flexWrap = 'nowrap';
  const left = document.createElement('div'), right = document.createElement('div');
  left.style.flex = `0 0 ${W}px`; right.style.flex = `0 0 ${W}px`;
  row.append(left, right);
  fig.viz.append(row);
  const mkCanvas = (parent: HTMLElement, title: string, w: number, h: number, cls = 'glow') => {
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h; cv.className = cls; cv.style.width = `${w}px`;
    const cap = document.createElement('div'); cap.className = 'viz-caption'; cap.textContent = title;
    parent.append(cv, cap);
    return cv;
  };
  const cortex = mkCanvas(left, 'Cortex: the synchronous patches', W, H, 'glow head-canvas');
  const scalp = mkCanvas(right, 'Scalp: the potential the electrodes record', W, H);
  const cctx = cortex.getContext('2d')!, sctx = scalp.getContext('2d')!;
  const half = document.createElement('canvas'); half.width = W / 2; half.height = H / 2;
  const hctx = half.getContext('2d')!;
  const himg = hctx.createImageData(half.width, half.height);

  const presets = document.createElement('div');
  presets.className = 'choice-group';
  const mk = (label: string, fn: () => void) => { const b = document.createElement('button'); b.className = 'btn'; b.textContent = label; b.addEventListener('click', () => { fn(); update(); }); presets.append(b); };
  let patches: Patch[] = [];
  const nearestSource = (x: number, y: number, z: number) => { let best = 0, bd = Infinity; srcPos.forEach((p, i) => { const d = Math.hypot(p[0] - x, p[1] - y, p[2] - z); if (d < bd) { bd = d; best = i; } }); return best; };
  const at = (x: number, y: number, z: number, r?: number): Patch => ({ center: nearestSource(x, y, z), radiusMm: r ?? sRadius.value });
  const VENN = () => [at(-16, 0, 112, 20), at(16, 0, 112, 20), at(0, 0, 115, 9)];
  mk('One patch', () => { patches = [at(-38, 0, 105)]; });
  mk('Two patches', () => { patches = [at(-38, 0, 105), at(38, 0, 105)]; });
  mk('Two + their overlap', () => { patches = VENN(); });
  mk('Ring of eight', () => { patches = [at(-45, 40, 85), at(45, 40, 85), at(-55, -10, 90), at(55, -10, 90), at(-35, -55, 75), at(35, -55, 75), at(-25, 70, 70), at(25, 70, 70)]; });
  mk('Clear', () => { patches = []; });
  fig.panel.append(presets, controls(sRadius.el, sQ.el, sNoise.el));
  fig.viz.append(readouts(rK.el, rD.el, rCeil.el, rVar.el));
  const bars = mkCanvas(fig.panel, '', 380, 100);
  bars.style.width = '100%';
  const barsCap = bars.nextElementSibling as HTMLElement;
  const bctx = bars.getContext('2d')!;
  assumptions(fig.el, [
    { what: 'Head', value: `fsaverage three-layer BEM (0.3 / 0.006 / 0.3 S/m), ${nSrc.toLocaleString('en-US')} cortical sources with dipoles normal to the cortex, BioSemi-128 electrodes, average reference`, cite: c('fsaverage-bem') + c('mne-bem') + c('montages') },
    { what: 'A patch', value: 'all cortical sources within the radius of a centre point, sharing the total moment equally; overlapping patches are separate sources', cite: '<span class="assumption-tag">model assumption</span>' },
    { what: 'Distinguishable', value: 'singular values of the patches’ scalp patterns divided by the per-electrode noise; those above 1 count', cite: c('svd-method') },
    { what: 'Ceiling', value: 'the same count for the full lead field, each cortical point carrying the moment of one patch', cite: c('svd-method') },
    { what: 'Components for 99% of the variance', value: 'lead-field components that carry 99% of the scalp variance of independent, identically distributed sources with 128 electrodes (scripts/leadfield_svd.py)', cite: c('svd-counts') },
    { what: 'Drawing', value: `view from above; only cortex and electrodes above the centre of a sphere fitted to the electrodes (radius ${fmt(R / 10, 3)} cm) are drawn, and the outline is the widest extent of those electrodes; the scalp map is a Gaussian-weighted average of all ${nCh} electrode values (width ${fmt(sigmaMm, 2)} mm) evaluated on that sphere; patch discs are drawn at the patch radius`, cite: '<span class="assumption-tag">display only</span>' },
  ]);

  // full lead-field singular values (for the ceiling): eigenvalues of L Lᵀ (nCh × nCh)
  const gram = new Float64Array(nCh * nCh);
  for (let i = 0; i < nCh; i++) for (let j = i; j < nCh; j++) {
    let acc = 0;
    for (let k = 0; k < nSrc; k++) acc += L[i * nSrc + k] * L[j * nSrc + k];
    gram[i * nCh + j] = acc; gram[j * nCh + i] = acc;
  }
  const fullSv = symmetricEigenvalues(gram, nCh).map((v) => Math.sqrt(Math.max(v, 0))); // µV per nA·m (per source)

  function patchPattern(p: Patch): { a: Float64Array; members: number[] } {
    const cpos = srcPos[p.center];
    const members: number[] = [];
    srcPos.forEach((q, i) => { if (dist3(q, cpos) <= p.radiusMm) members.push(i); });
    const a = new Float64Array(nCh);
    const q = sQ.value / members.length;
    for (const m of members) for (let ch = 0; ch < nCh; ch++) a[ch] += L[ch * nSrc + m] * q;
    return { a, members };
  }

  const PATCH_COLOURS = ['#2a78d6', '#eb6834', '#1baf7a', '#6250d6', '#eda100', '#e34948', '#008383', '#8a6d3b'];

  const headPath = (ctx: CanvasRenderingContext2D) => { ctx.beginPath(); ctx.ellipse(cx, cy, ax * s, by * s, 0, 0, 2 * Math.PI); };
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

  function drawCortex() {
    cctx.clearRect(0, 0, W, H);
    drawGridHead(cctx);
    // the cortex as a stipple of its source points (only the surface seen from above)
    cctx.fillStyle = 'rgba(26,26,26,0.22)';
    for (const [x, y, z] of srcXY) { if (!visible(z)) continue; cctx.beginPath(); cctx.arc(x, y, 1.3, 0, 2 * Math.PI); cctx.fill(); }
    cctx.save();
    cctx.globalCompositeOperation = 'multiply';
    patches.forEach((p, idx) => {
      const [x0, y0] = srcXY[p.center];
      const r = Math.max(4, p.radiusMm * s);
      const g = cctx.createRadialGradient(x0, y0, 0, x0, y0, r);
      const col = PATCH_COLOURS[idx % PATCH_COLOURS.length];
      g.addColorStop(0, col + 'e6'); g.addColorStop(0.6, col + '99'); g.addColorStop(1, col + '00');
      cctx.fillStyle = g;
      cctx.beginPath(); cctx.arc(x0, y0, r, 0, 2 * Math.PI); cctx.fill();
    });
    cctx.restore();
    patches.forEach((p, idx) => {
      const [x0, y0] = srcXY[p.center];
      cctx.font = 'bold 14px system-ui, sans-serif'; cctx.fillStyle = '#1a1a1a'; cctx.textAlign = 'center';
      cctx.fillText(String(idx + 1), x0, y0 + 5);
    });
    headOutline(cctx);
  }

  function drawScalp(total: Float64Array) {
    sctx.clearRect(0, 0, W, H);
    const vmax = Math.max(1e-9, ...Array.from(total, Math.abs));
    const hw = half.width, hh = half.height, d = himg.data;
    const twoSig = 2 * sigmaMm * sigmaMm;
    for (let j = 0; j < hh; j++) for (let i = 0; i < hw; i++) {
      const k = (j * hw + i) * 4;
      const px = (i + 0.5) * 2, py = (j + 0.5) * 2;
      const x = x0 + (px - cx) / s, y = y0 - (py - cy) / s; // head coordinates, mm
      if (!inHead(x, y)) { d[k + 3] = 0; continue; }
      const X = x - centre[0], Y = y - centre[1];
      const Z = Math.sqrt(Math.max(0, R * R - X * X - Y * Y)); // height on the fitted sphere (its rim beyond it)
      let num = 0, den = 0;
      for (let e = 0; e < nCh; e++) {
        const ex = elPos[e][0] - x, ey = elPos[e][1] - y, ez = elPos[e][2] - centre[2] - Z;
        const w = Math.exp(-(ex * ex + ey * ey + ez * ez) / twoSig);
        num += w * total[e]; den += w;
      }
      const v = den > 1e-12 ? num / den / vmax : 0;
      const col = v >= 0 ? [227, 73, 72] : [42, 120, 214];
      d[k] = col[0]; d[k + 1] = col[1]; d[k + 2] = col[2]; d[k + 3] = Math.round(225 * Math.min(1, Math.abs(v)));
    }
    hctx.putImageData(himg, 0, 0);
    sctx.save();
    headPath(sctx); sctx.clip();
    sctx.imageSmoothingEnabled = true;
    sctx.drawImage(half, 0, 0, W, H);
    sctx.restore();
    drawGridHead(sctx);
    sctx.fillStyle = 'rgba(26,26,26,0.7)';
    for (const [x, y, z] of elXY) { if (!visible(z)) continue; sctx.beginPath(); sctx.arc(x, y, 2, 0, 2 * Math.PI); sctx.fill(); }
    headOutline(sctx);
    sctx.font = CANVAS_FONT; sctx.fillStyle = '#1a1a1a'; sctx.textAlign = 'right';
    sctx.fillText(`peak ${fmt(vmax, 2)} µV`, W - 6, 18);
  }

  function drawBars(sv: number[], noise: number) {
    const W = bars.width, H = bars.height, ml = 50, mb = 22, mt = 8;
    bctx.clearRect(0, 0, W, H);
    const D = sv.filter((v) => v > noise).length;
    barsCap.textContent = !sv.length ? 'Place a patch to see its scalp pattern.'
      : `${sv.length} scalp pattern${sv.length === 1 ? '' : 's'}, strongest first; ${D} above the noise${D < sv.length ? '. The rest are too alike after the skull’s blur.' : '.'}`;
    const lo = Math.log10(noise / 30), hi = Math.log10(Math.max(noise * 30, ...sv, 1e-9) * 1.5);
    const y = (v: number) => mt + (H - mt - mb) * (1 - (Math.log10(Math.max(v, Math.pow(10, lo))) - lo) / (hi - lo));
    bctx.strokeStyle = '#c3c2b7'; bctx.lineWidth = 1;
    bctx.beginPath(); bctx.moveTo(ml, mt); bctx.lineTo(ml, H - mb); bctx.lineTo(W - 8, H - mb); bctx.stroke();
    bctx.fillStyle = '#898781'; bctx.font = '13px system-ui, sans-serif'; bctx.textAlign = 'right';
    for (const tick of [0.1, 1, 10]) { const v = noise * tick; if (v < Math.pow(10, lo) || v > Math.pow(10, hi)) continue; bctx.fillText(`${fmt(v, 2)} µV`, ml - 4, y(v) + 4); }
    bctx.strokeStyle = '#898781'; bctx.setLineDash([4, 3]);
    bctx.beginPath(); bctx.moveTo(ml, y(noise)); bctx.lineTo(W - 8, y(noise)); bctx.stroke();
    bctx.setLineDash([]);
    bctx.textAlign = 'left'; bctx.fillText('noise', W - 40, y(noise) - 4);
    const n = Math.max(sv.length, 1), bw = Math.min(30, (W - ml - 56) / n - 5);
    sv.forEach((v, i) => {
      const x = ml + 8 + i * (bw + 5);
      bctx.fillStyle = v > noise ? '#2a78d6' : '#c3c2b7';
      bctx.fillRect(x, y(v), bw, H - mb - y(v));
      bctx.fillStyle = '#52514e'; bctx.textAlign = 'center';
      bctx.fillText(String(i + 1), x + bw / 2, H - mb + 14);
    });
    if (!sv.length) { bctx.fillStyle = '#52514e'; bctx.textAlign = 'center'; bctx.fillText('no patches placed', (ml + W) / 2, H / 2); }
  }

  function update() {
    const noise = sNoise.value;
    const pats = patches.map(patchPattern);
    const total = new Float64Array(nCh);
    for (const p of pats) for (let ch = 0; ch < nCh; ch++) total[ch] += p.a[ch];
    const sv = singularValues(pats.map((p) => p.a));
    const D = sv.filter((v) => v > noise).length;
    drawCortex();
    drawScalp(total);
    drawBars(sv, noise);
    rK.set(String(patches.length));
    rD.set(`${D}`);
    const members = pats.length ? pats[0].members.length : Math.max(1, Math.round(Math.PI * sRadius.value * sRadius.value / 50));
    const qPerPoint = sQ.value / members;
    rCeil.set(`${fullSv.filter((v) => v * qPerPoint > noise).length}`);
    rVar.set(`${svd.models.bem.biosemi128.components_99pct}`);
  }
  cortex.addEventListener('click', (ev) => {
    const r = cortex.getBoundingClientRect();
    const x = ((ev.clientX - r.left) / r.width) * W;
    const y = ((ev.clientY - r.top) / r.height) * H;
    // remove a patch if its centre was clicked
    const hit = patches.findIndex((p) => Math.hypot(srcXY[p.center][0] - x, srcXY[p.center][1] - y) < 9);
    if (hit >= 0) { patches.splice(hit, 1); update(); return; }
    let best = -1, bd = Infinity;
    srcXY.forEach(([sx, sy, z], i) => { if (!visible(z)) return; const d = Math.hypot(sx - x, sy - y); if (d < bd) { bd = d; best = i; } });
    if (best >= 0 && bd < 12) { patches.push({ center: best, radiusMm: sRadius.value }); update(); }
  });
  sRadius.onChange((v) => { patches = patches.map((p) => ({ ...p, radiusMm: v })); update(); });
  [sQ, sNoise].forEach((sl) => sl.onChange(update));
  patches = VENN();
  update();
}

function dist3(a: number[], b: number[]): number { return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]); }

/** Least-squares sphere through a set of points: x² + y² + z² = 2ax + 2by + 2cz + d. */
function fitSphere(pts: number[][]): { centre: number[]; R: number } {
  // normal equations for [a, b, c, d]
  const M = Array.from({ length: 4 }, () => new Array(4).fill(0)), rhs = new Array(4).fill(0);
  for (const p of pts) {
    const row = [2 * p[0], 2 * p[1], 2 * p[2], 1], t = p[0] * p[0] + p[1] * p[1] + p[2] * p[2];
    for (let i = 0; i < 4; i++) { rhs[i] += row[i] * t; for (let j = 0; j < 4; j++) M[i][j] += row[i] * row[j]; }
  }
  // solve by Gaussian elimination
  const a = M.map((r, i) => [...r, rhs[i]]);
  for (let c = 0; c < 4; c++) {
    let piv = c; for (let r = c + 1; r < 4; r++) if (Math.abs(a[r][c]) > Math.abs(a[piv][c])) piv = r;
    [a[c], a[piv]] = [a[piv], a[c]];
    for (let r = c + 1; r < 4; r++) { const f = a[r][c] / a[c][c]; for (let k = c; k <= 4; k++) a[r][k] -= f * a[c][k]; }
  }
  const x = new Array(4).fill(0);
  for (let r = 3; r >= 0; r--) { let acc = a[r][4]; for (let k = r + 1; k < 4; k++) acc -= a[r][k] * x[k]; x[r] = acc / a[r][r]; }
  const centre = [x[0], x[1], x[2]];
  return { centre, R: Math.sqrt(x[3] + x[0] * x[0] + x[1] * x[1] + x[2] * x[2]) };
}
