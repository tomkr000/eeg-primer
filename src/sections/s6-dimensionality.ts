import { symmetricEigenvalues } from '../physics/linalg';
import { controls, readout, slider, fmt } from '../ui/slider';
import { P, claimCite as c } from '../data/params';
import { netDipole } from '../physics/population';
import { sourceSliders } from './s4-noise';
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

interface Patch { center: number; radiusMm: number; name?: string; }

export function mountDimensionality(root: HTMLElement) {
  const sec = section(root, 'dimensionality', '6', 'A head with EEG can operate only a few dimensions');
  prose(sec.text, `
<p>How many independent signals, or dimensions of control, can a head with EEG on it operate? Three limits
stack up, and the answer is a handful. The first is blur: the skull smears every source into a blob several
centimetres wide ${c('spatial-lowpass')}, so only about 20 to 26 distinct scalp patterns exist at all,
however many electrodes you add ${c('svd-counts')}${c('iivanainen-eigen')}${c('spatial-nyquist')}. The second
is noise: a pattern counts only if it stands above the noise floor, and two patches closer than a few
centimetres, or one nested inside another, produce patterns too alike to separate ${c('svd-method')}. The
third is will: a person cannot modulate arbitrary patches of cortex on demand. What can be modulated at will
and still seen from outside are the sensorimotor rhythms of a few body parts: the hands, the feet and the
tongue, the four motor-imagery classes used in brain–computer interface (BCI) competitions ${c('mi-classes')}.
Their cortical areas are not spread evenly: the hand areas sit on a knob of the precentral gyrus either side
of the midline, the foot areas next to the midline, and the mouth areas low on the side of the head
${c('motor-map')}, so only a few of them give separable scalp patterns.</p>
<p>The figure places patches on a real head, the fsaverage template with a three-layer boundary-element
model and 128 electrodes ${c('fsaverage-bem')}${c('mne-bem')}${c('montages')}, and counts how many are
separable at the chosen noise. The default preset puts them at the hand, foot and tongue areas. The ceiling,
if every point of the cortex were its own source, is a few dozen with the default settings; adding electrodes
beyond the skull’s resolution only samples the same blur again ${c('ryynanen')}, and blind decomposition
of real 71-channel EEG yields about 34 near-dipolar components ${c('ica-dipolar')}.</p>
<p>The record agrees with the count. Volitional control from sensorimotor rhythms has reached three
independent dimensions ${c('dof-control')}; the fastest spellers manage about 5 bits/s only by decoding
responses to flickering targets chosen by gaze, which is a selection, not a dimension of control
${c('itr-ssvep')}${c('itr-2002')}; attempts to read limb trajectories from EEG did not beat chance
${c('kinematics-chance')}. Each dimension is also read from about a second of signal (section 7).
Intracortical arrays, for comparison, decode handwriting at 90 characters/min and speech at 62 words/min
${c('intracortical')}.</p>`);

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
  const W = 345, H = 270, cx = W / 2, cy = H / 2 + 4;
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

  const { sN, sF } = sourceSliders(P.patchDefaultN); // the source model of sections 2 to 5
  const sRadius = slider({ label: 'Patch radius', unit: 'mm', min: 4, max: 30, value: 10, step: 1 });
  const sNoise = slider({ label: 'Noise of one electrode contact', unit: 'µV rms', min: 1, max: 20, value: 1, log: true, note: c('skin-noise'), marks: [{ value: 1, label: 'Quietest measured' }, { value: 8, label: 'Dry contact' }] });
  const momentNam = () => netDipole(Math.round(sN.value), sF.value, 1, P.singleCellMomentPAm * 1e-12).total * 1e9;
  const rD = readout('patches told apart from outside at this noise');
  const rCeil = readout('the ceiling: every point of cortex as its own source, same noise', c('svd-method'));
  const rRecord = readout('the record: dimensions people have controlled at will', c('dof-control'));

  const fig = figure(sec.fig, `A real head (the fsaverage template) from above, nose up. Left: the cortex; each patch is N cells with a fraction in step (the source of sections 2 to 5) over a disc of the chosen radius; the preset puts five on the areas a person can modulate at will ${c('mi-classes')}${c('motor-map')}; click to add a patch, click one to remove it. Middle: the scalp potential of all patches together. Bottom: the patches taken in turn, strongest first; each bar is the signal that patch adds which the earlier ones cannot mimic ${c('svd-method')}.`, { panelWidth: '400px' });
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
  const scalp = mkCanvas(right, 'Scalp: all patches together', W, H);
  const cctx = cortex.getContext('2d')!, sctx = scalp.getContext('2d')!;
  const half = document.createElement('canvas'); half.width = W / 2; half.height = H / 2;
  const hctx = half.getContext('2d')!;
  const himg = hctx.createImageData(half.width, half.height);
  // the bottom row: bars with one small scalp map per patch, and the verdict beside them
  const row2 = document.createElement('div');
  row2.className = 'viz-row dims-row';
  row2.style.gridColumn = '1 / -1';
  const dimsHolder = document.createElement('div');
  dimsHolder.style.flex = '1 1 600px';
  const dims = document.createElement('canvas');
  dims.className = 'glow'; dims.height = 192;
  dimsHolder.append(dims);
  const verdict = readouts(rD.el, rCeil.el, rRecord.el);
  verdict.className = 'readouts verdict';
  row2.append(dimsHolder, verdict);
  fig.el.insertBefore(row2, fig.caption);
  const dctx = dims.getContext('2d')!;
  // small scalp maps: a fixed grid over the head outline with precomputed interpolation weights per electrode
  const G = 56;
  const mini = document.createElement('canvas'); mini.width = G; mini.height = G;
  const mctx = mini.getContext('2d')!, mimg = mctx.createImageData(G, G);
  const miniW = new Float32Array(G * G * nCh), miniIn = new Uint8Array(G * G);
  {
    const twoSig = 2 * sigmaMm * sigmaMm;
    for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) {
      const x = x0 + ((i + 0.5) / G - 0.5) * 2 * ax, y = y0 - ((j + 0.5) / G - 0.5) * 2 * by; // head coordinates, mm
      if (!inHead(x, y)) continue;
      miniIn[j * G + i] = 1;
      const X = x - centre[0], Y = y - centre[1], Z = Math.sqrt(Math.max(0, R * R - X * X - Y * Y));
      let den = 0;
      for (let e = 0; e < nCh; e++) { const ex = elPos[e][0] - x, ey = elPos[e][1] - y, ez = elPos[e][2] - centre[2] - Z; const w = Math.exp(-(ex * ex + ey * ey + ez * ez) / twoSig); miniW[(j * G + i) * nCh + e] = w; den += w; }
      for (let e = 0; e < nCh; e++) miniW[(j * G + i) * nCh + e] /= den || 1;
    }
  }

  const presets = document.createElement('div');
  presets.className = 'choice-group';
  const mk = (label: string, fn: () => void) => { const b = document.createElement('button'); b.className = 'btn'; b.textContent = label; b.addEventListener('click', () => { fn(); update(); }); presets.append(b); };
  let patches: Patch[] = [];
  const nearestSource = (x: number, y: number, z: number) => { let best = 0, bd = Infinity; srcPos.forEach((p, i) => { const d = Math.hypot(p[0] - x, p[1] - y, p[2] - z); if (d < bd) { bd = d; best = i; } }); return best; };
  const at = (x: number, y: number, z: number, r?: number): Patch => ({ center: nearestSource(x, y, z), radiusMm: r ?? sRadius.value });
  const VENN = () => [at(-16, 0, 112, 20), at(16, 0, 112, 20), at(0, 0, 115, 9)];
  // motor areas in fsaverage head coordinates (mm), converted from approximate MNI coordinates with MNE (claim motor-map)
  const MOTOR = (): Patch[] => [
    { ...at(-38.8, 9.6, 98.9, 10), name: 'left hand' }, { ...at(35.2, 9.3, 98.9, 10), name: 'right hand' }, { ...at(-1.9, 5.2, 113.2, 10), name: 'feet' },
    { ...at(-56.8, 25.3, 76.0, 10), name: 'tongue' }, { ...at(53.2, 25.0, 76.0, 10), name: 'tongue' },
  ];
  mk('Motor areas: hands, feet, tongue', () => { patches = MOTOR(); });
  mk('One patch', () => { patches = [at(-38, 0, 105)]; });
  mk('Two patches', () => { patches = [at(-38, 0, 105), at(38, 0, 105)]; });
  mk('Two + overlap', () => { patches = VENN(); });
  mk('Ring of 8', () => { patches = [at(-45, 40, 85), at(45, 40, 85), at(-55, -10, 90), at(55, -10, 90), at(-35, -55, 75), at(35, -55, 75), at(-25, 70, 70), at(25, 70, 70)]; });
  mk('Clear', () => { patches = []; });
  fig.panel.append(presets, controls(sN.el, sF.el, sRadius.el, sNoise.el));
  const FLOOR = 0.1, CEIL = 50; // µV: the summed scalp map's colour scale
  assumptions(fig.el, [
    { what: 'Head', value: `fsaverage three-layer BEM (0.3 / 0.006 / 0.3 S/m), ${nSrc.toLocaleString('en-US')} cortical sources with dipoles normal to the cortex, BioSemi-128 electrodes, average reference`, cite: c('fsaverage-bem') + c('mne-bem') + c('montages') },
    { what: 'A patch', value: `N cells with a fraction in step (N × fraction × ${P.singleCellMomentPAm} pA·m plus the √N random part, as in sections 2 to 5), shared equally by all cortical sources within the radius of a centre point; a disc of the default radius holds about ${fmt(Math.PI * 100 * P.neuronsPerMm2 / 1e6, 2)} million cells, so N is a small fraction of them; overlapping patches are separate sources`, cite: c('single-cell-moment') + c('variances-add') + c('neuron-density') },
    { what: 'Noise of one contact', value: 'the electrode–skin noise of a single contact, 1 to 20 µV rms as measured; the slider starts at the quietest contact ever measured and marks a typical dry contact; muscle, blinks and mains (section 4) would add to it', cite: c('skin-noise') },
    { what: 'Told apart', value: 'patches are taken in turn, each time the one whose scalp pattern differs most from every combination of those already taken (column-pivoted QR); the bar is the size of that remainder over the 128 electrodes, and the patch counts when it exceeds the noise of one contact. Counting the best combinations instead (singular values above the noise, the criterion of the next row) gives the same number to within one for the presets', cite: '<span class="assumption-tag">model assumption</span>' + c('svd-method') },
    { what: 'Ceiling', value: `singular values of the full lead field, each cortical point carrying the moment of one patch, counted above the noise; ${svd.models.bem.biosemi128.components_99pct} lead-field components carry 99% of the scalp variance of independent, identically distributed sources (scripts/leadfield_svd.py)`, cite: c('svd-method') + c('svd-counts') },
    { what: 'Drawing', value: `view from above; only cortex and electrodes above the centre of a sphere fitted to the electrodes (radius ${fmt(R / 10, 3)} cm) are drawn, and the outline is the widest extent of those electrodes; scalp maps are a Gaussian-weighted average of all ${nCh} electrode values (width ${fmt(sigmaMm, 2)} mm) on that sphere; the summed map fades from ${FLOOR} µV to solid at ${CEIL} µV on a log scale, the small maps are each scaled to their own peak; patch discs are drawn at the patch radius`, cite: '<span class="assumption-tag">drawing</span>' },
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
    const q = momentNam() / members.length;
    for (const m of members) for (let ch = 0; ch < nCh; ch++) a[ch] += L[ch * nSrc + m] * q;
    return { a, members };
  }

  /** Patches in the order a decoder would take them: each the most unlike every combination of those before; the remainder's size in µV. */
  function greedyOrder(vecs: Float64Array[]): { idx: number; rest: number }[] {
    const basis: Float64Array[] = [], out: { idx: number; rest: number }[] = [];
    const left = vecs.map((_, i) => i);
    const dot = (u: Float64Array, v: Float64Array) => { let s = 0; for (let i = 0; i < u.length; i++) s += u[i] * v[i]; return s; };
    while (left.length) {
      let best = -1, bestR: Float64Array | null = null, bestN = -1;
      for (const k of left) {
        const r = Float64Array.from(vecs[k]);
        for (const b of basis) { const d = dot(r, b); for (let i = 0; i < r.length; i++) r[i] -= d * b[i]; }
        const nrm = Math.sqrt(dot(r, r));
        if (nrm > bestN) { bestN = nrm; best = k; bestR = r; }
      }
      out.push({ idx: best, rest: bestN });
      left.splice(left.indexOf(best), 1);
      if (bestR && bestN > 1e-12) basis.push(Float64Array.from(bestR, (v) => v / bestN));
    }
    return out;
  }

  const PATCH_COLOURS = ['#2a78d6', '#eb6834', '#1baf7a', '#6250d6', '#eda100', '#e34948', '#008383', '#8a6d3b'];
  const label = (p: Patch, i: number) => p.name ? `${i + 1} ${p.name}` : `patch ${i + 1}`;

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
    // name labels: below the disc, else above, left or right, wherever they hit neither a disc nor an earlier label
    type Box = [number, number, number, number]; // x from, x to, y from, y to
    const taken: Box[] = patches.map((p) => { const [x0, y0] = srcXY[p.center], r = Math.max(4, p.radiusMm * s); return [x0 - r, x0 + r, y0 - r, y0 + r]; });
    const hits = (b: Box, skip: number) => taken.some((t, i) => i !== skip && b[0] < t[1] && b[1] > t[0] && b[2] < t[3] && b[3] > t[2]);
    patches.forEach((p, idx) => {
      const [x0, y0] = srcXY[p.center];
      cctx.font = 'bold 14px system-ui, sans-serif'; cctx.fillStyle = '#1a1a1a'; cctx.textAlign = 'center';
      cctx.fillText(String(idx + 1), x0, y0 + 5);
      if (!p.name) return;
      const w = p.name.length * 6.5, r = Math.max(4, p.radiusMm * s);
      const spots: [number, number][] = [[x0, y0 + r + 14], [x0, y0 - r - 5], [x0 - r - w / 2 - 4, y0 + 5], [x0 + r + w / 2 + 4, y0 + 5]];
      const [lx, ly] = spots.find(([x, y]) => !hits([x - w / 2, x + w / 2, y - 12, y], idx)) ?? spots[0];
      taken.push([lx - w / 2, lx + w / 2, ly - 12, ly]);
      cctx.font = '12px system-ui, sans-serif'; cctx.fillText(p.name, lx, ly);
    });
    headOutline(cctx);
  }

  /** the scalp potential of all patches together on an absolute log colour scale, so N and the fraction in step show */
  function drawSummed(total: Float64Array, noise: number) {
    sctx.clearRect(0, 0, W, H);
    let vmax = 0;
    const hw = half.width, hh = half.height, d = himg.data;
    const twoSig = 2 * sigmaMm * sigmaMm, lf = Math.log10(FLOOR), lc = Math.log10(CEIL);
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
      const v = den > 1e-12 ? num / den : 0;
      vmax = Math.max(vmax, Math.abs(v));
      const t = Math.max(0, Math.min(1, (Math.log10(Math.max(Math.abs(v), 1e-30)) - lf) / (lc - lf)));
      const col = v >= 0 ? [227, 73, 72] : [42, 120, 214];
      d[k] = col[0]; d[k + 1] = col[1]; d[k + 2] = col[2]; d[k + 3] = Math.round(235 * t);
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
    sctx.fillStyle = '#1a1a1a'; sctx.textAlign = 'right';
    sctx.font = 'bold 15px system-ui, sans-serif'; sctx.fillText(`peak ${fmt(vmax, 2)} µV`, W - 6, 18);
    sctx.font = '12px system-ui, sans-serif'; sctx.fillStyle = '#52514e';
    sctx.fillText(`noise of one contact ${fmt(noise, 2)} µV`, W - 6, 33);
    sctx.fillText(`faint ${FLOOR} µV, solid ${CEIL} µV`, W - 6, 47);
  }

  /** the bottom row: one bar and one small scalp map per patch, strongest first, against the noise of one contact */
  function drawDims(pats: { a: Float64Array }[], order: { idx: number; rest: number }[], noise: number) {
    const DW = Math.max(560, dimsHolder.clientWidth || 0), DH = dims.height;
    dims.width = DW; dims.style.width = `${DW}px`;
    dctx.clearRect(0, 0, DW, DH);
    dctx.font = 'bold 14px system-ui, sans-serif'; dctx.fillStyle = '#1a1a1a'; dctx.textAlign = 'left';
    dctx.fillText('Taken in turn, strongest first: the new signal each patch adds, against the noise of one electrode contact', 8, 16);
    const ml = 56, mt = 30, mb = 88, mr = 12;
    const vals = order.map((o) => o.rest);
    const lo = Math.log10(noise / 10), hi = Math.log10(Math.max(noise * 20, ...vals, 1e-9) * 1.6);
    const y = (v: number) => mt + (DH - mt - mb) * (1 - (Math.log10(Math.max(v, Math.pow(10, lo))) - lo) / (hi - lo));
    dctx.strokeStyle = '#c3c2b7'; dctx.lineWidth = 1;
    dctx.beginPath(); dctx.moveTo(ml, mt); dctx.lineTo(ml, DH - mb); dctx.lineTo(DW - mr, DH - mb); dctx.stroke();
    dctx.fillStyle = '#898781'; dctx.font = '12px system-ui, sans-serif'; dctx.textAlign = 'right';
    for (const v of [0.1, 1, 10, 100, 1000]) { if (v < Math.pow(10, lo) || v > Math.pow(10, hi)) continue; dctx.fillText(`${fmt(v, 2)} µV`, ml - 4, y(v) + 4); }
    dctx.strokeStyle = '#52514e'; dctx.setLineDash([5, 4]);
    dctx.beginPath(); dctx.moveTo(ml, y(noise)); dctx.lineTo(DW - mr, y(noise)); dctx.stroke();
    dctx.setLineDash([]);
    dctx.fillStyle = '#52514e'; dctx.textAlign = 'right'; dctx.font = '13px system-ui, sans-serif';
    dctx.fillText(`noise of one contact, ${fmt(noise, 2)} µV`, DW - mr - 4, y(noise) - 5);
    dctx.fillText('below this line a patch adds nothing a decoder can use', DW - mr - 4, y(noise) + 15);
    if (!order.length) { dctx.textAlign = 'center'; dctx.fillText('no patches placed: click the cortex to add one', (ml + DW) / 2, (mt + DH - mb) / 2); return; }
    const NOTE_W = 330; // room kept at the right for the noise-line and map notes
    const slot = Math.min(84, (DW - ml - mr - NOTE_W - 10) / order.length), bw = Math.min(34, slot - 12);
    let firstGrey = true;
    order.forEach((o, i) => {
      const xc = ml + 10 + i * slot + slot / 2, p = patches[o.idx], above = o.rest > noise;
      dctx.fillStyle = above ? PATCH_COLOURS[o.idx % PATCH_COLOURS.length] : '#c3c2b7';
      dctx.fillRect(xc - bw / 2, y(o.rest), bw, DH - mb - y(o.rest));
      dctx.fillStyle = above ? '#1a1a1a' : '#898781'; dctx.textAlign = 'center'; dctx.font = '12px system-ui, sans-serif';
      dctx.fillText(`${fmt(o.rest, 2)} µV`, xc, y(o.rest) - 4);
      if (!above && firstGrey && slot >= 70) { firstGrey = false; dctx.font = 'italic 12px system-ui, sans-serif'; dctx.fillText('a mix of the others', xc, y(o.rest) - 18); }
      // the patch's own scalp pattern, scaled to its own peak, as the bar's label
      const vals = new Float32Array(G * G), d = mimg.data; let vm = 1e-9;
      for (let g = 0; g < G * G; g++) { if (!miniIn[g]) continue; let v = 0; for (let e = 0; e < nCh; e++) v += miniW[g * nCh + e] * pats[o.idx].a[e]; vals[g] = v; vm = Math.max(vm, Math.abs(v)); }
      for (let g = 0; g < G * G; g++) { const v = vals[g] / vm, col = v >= 0 ? [227, 73, 72] : [42, 120, 214]; d[g * 4] = col[0]; d[g * 4 + 1] = col[1]; d[g * 4 + 2] = col[2]; d[g * 4 + 3] = miniIn[g] ? Math.round(225 * Math.min(1, Math.abs(v))) : 0; }
      mctx.putImageData(mimg, 0, 0);
      const ry = 26, rx = ry * ax / by, oy = DH - mb + 8 + ry;
      dctx.save(); dctx.beginPath(); dctx.ellipse(xc, oy, rx, ry, 0, 0, 2 * Math.PI); dctx.clip();
      dctx.drawImage(mini, xc - rx, oy - ry, 2 * rx, 2 * ry); dctx.restore();
      dctx.strokeStyle = PATCH_COLOURS[o.idx % PATCH_COLOURS.length]; dctx.lineWidth = 1.5;
      dctx.beginPath(); dctx.ellipse(xc, oy, rx, ry, 0, 0, 2 * Math.PI); dctx.stroke();
      dctx.fillStyle = '#1a1a1a'; dctx.font = '12px system-ui, sans-serif'; dctx.textAlign = 'center';
      dctx.fillText(slot >= 70 ? label(p, o.idx) : String(o.idx + 1), xc, DH - 8);
    });
    dctx.fillStyle = '#52514e'; dctx.font = 'italic 12px system-ui, sans-serif'; dctx.textAlign = 'right';
    dctx.fillText('each patch as it looks from outside', DW - mr - 4, DH - mb + 30);
    dctx.fillText('red positive, blue negative, each to its own peak', DW - mr - 4, DH - mb + 46);
  }

  function update() {
    const noise = sNoise.value;
    const pats = patches.map(patchPattern);
    const total = new Float64Array(nCh);
    for (const p of pats) for (let ch = 0; ch < nCh; ch++) total[ch] += p.a[ch];
    const order = greedyOrder(pats.map((p) => p.a));
    const D = order.filter((o) => o.rest > noise).length;
    drawCortex();
    drawSummed(total, noise);
    drawDims(pats, order, noise);
    rD.set(patches.length ? `${D} of ${patches.length}` : 'none placed');
    const members = pats.length ? pats[0].members.length : Math.max(1, Math.round(Math.PI * sRadius.value * sRadius.value / 50));
    const qPerPoint = momentNam() / members;
    rCeil.set(`${fullSv.filter((v) => v * qPerPoint > noise).length}`);
    rRecord.set('3');
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
  [sN, sF, sNoise].forEach((sl) => sl.onChange(update));
  new ResizeObserver(() => update()).observe(dimsHolder);
  patches = MOTOR();
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
