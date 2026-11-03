import { claimCite as c } from '../data/params';
import { fmt, readout, slider } from '../ui/slider';
import { section, figure, prose, assumptions, readouts } from '../ui/layout';
import { textWithSwatches, partsWidth, type TextPart } from '../ui/field';
import { state, subscribe, notify, dimControls, patchPattern, greedyOrder, ceilingCount, patchColour, patchLabel, MOTOR, SPARE_SPOTS, at, COMPONENTS_99 } from './dim-model';
import { headGeometry, titledCanvas, footnote, drawCortex, patchAt, sourceAt, canvasPoint } from './head-view';

/** a boxed note with a pointer line to a spot; colours in the text appear as swatches */
function callout(ctx: CanvasRenderingContext2D, lines: TextPart[][], x: number, y: number, tx: number, ty: number) {
  ctx.save();
  ctx.font = '13px system-ui, sans-serif';
  const w = Math.max(...lines.map((l) => partsWidth(ctx, l, 13))) + 14, h = lines.length * 16 + 8;
  const ax = Math.min(Math.max(tx, x + 8), x + w - 8), ay = ty > y + h ? y + h : y;
  ctx.strokeStyle = '#1a1a1a'; ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(tx, ty); ctx.stroke();
  ctx.fillStyle = '#1a1a1a'; ctx.beginPath(); ctx.arc(tx, ty, 3, 0, 2 * Math.PI); ctx.fill();
  ctx.fillStyle = 'rgba(252,252,251,0.95)'; ctx.strokeStyle = '#898781'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.roundRect(x, y, w, h, 4); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#1a1a1a';
  lines.forEach((l, i) => textWithSwatches(ctx, l, x + 7, y + 17 + i * 16, 13));
  ctx.restore();
}

const W = 360, H = 360, FOOT = 46;
const geo = headGeometry(W, H);

export function mountDimensions(root: HTMLElement) {
  const sec = section(root, 'dimensions', '7', 'A head with EEG can operate only a few dimensions', 'Patches whose blobs cannot be told apart do not count');
  prose(sec.text, `
<p>How many independent signals, or dimensions of control, can a head with EEG on it operate? A patch
counts only if its scalp pattern stands above the noise after everything the other patches could produce
has been subtracted; the figure takes the patches in turn and does exactly that. Blur caps the answer
whatever is placed: only about 20 to 26 distinct scalp patterns exist at all, however many electrodes are
added ${c('svd-counts')}${c('iivanainen-eigen')}${c('spatial-nyquist')}, because electrodes beyond the
skull’s resolution only sample the same blur again ${c('ryynanen')}; blind decomposition of real 71-channel
EEG yields about 34 near-dipolar components ${c('ica-dipolar')}.</p>
<p>The record agrees with the count. Volitional control from sensorimotor rhythms has reached three
independent dimensions ${c('dof-control')}; the fastest spellers manage about 5 bits/s only by decoding
responses to flickering targets chosen by gaze, which is a selection, not a dimension of control
${c('itr-ssvep')}${c('itr-2002')}; attempts to read limb trajectories from EEG did not beat chance
${c('kinematics-chance')}. Each dimension is also read from about a second of signal (section 8).
Intracortical arrays, for comparison, decode handwriting at 90 characters/min and speech at 62 words/min
${c('intracortical')}.</p>`);

  const rD = readout('patches told apart from outside, at this noise');
  const rCeil = readout('the ceiling: the whole cortex tiled with patches this size, same noise', c('svd-method'));
  const rRecord = readout('the record: dimensions people have controlled at will', c('dof-control'));
  const fig = figure(sec.fig, `Left: the patches, starting from the motor set of section 4; drag one to move it, and the slider adds patches (placed round the top of the head) or removes them. Right: the patches taken in turn, strongest first; each bar is the scalp signal that patch adds which the patches before it cannot mimic, against the noise of one electrode contact ${c('svd-method')}${c('skin-noise')}. The N, synchrony, radius and noise sliders are the same as in section 4 and move together.`, { wide: true });
  const row = document.createElement('div');
  row.className = 'viz-row dims-row';
  row.style.flexWrap = 'nowrap';
  const cortexBox = document.createElement('div');
  cortexBox.style.flex = `0 0 ${W}px`;
  const cortex = titledCanvas(cortexBox, 'Patches on the cortex: drag to move', W, H + FOOT, 'glow head-drag');
  const cctx = cortex.getContext('2d')!;
  const holder = document.createElement('div');
  holder.className = 'viz-box'; holder.style.flex = '1 1 400px';
  const title = document.createElement('div'); title.className = 'viz-title';
  title.textContent = 'Scalp signal each patch adds beyond what the earlier patches account for, strongest first';
  const canvas = document.createElement('canvas'); canvas.className = 'glow'; canvas.height = 340;
  holder.append(title, canvas);
  const verdict = readouts(rD.el, rCeil.el, rRecord.el);
  verdict.className = 'readouts verdict';
  row.append(cortexBox, holder, verdict);
  fig.viz.append(row);
  const sCount = slider({ label: 'Number of patches', min: 1, max: 5 + SPARE_SPOTS.length, step: 1, value: 5, marks: [{ value: 5, label: 'Motor set' }] });
  fig.panel.append(dimControls({ extra: [sCount.el] }));
  const ctx = canvas.getContext('2d')!;
  assumptions(fig.el, [
    { what: 'Noise of one contact', value: 'the electrode–skin noise of a single contact, 1 to 20 µV rms as measured; the slider starts at the quietest contact ever measured and marks a typical dry contact; muscle, blinks and mains (section 5) would add to it', cite: c('skin-noise') },
    { what: 'Told apart', value: 'patches are taken in turn, each time the one whose scalp pattern differs most from every combination of those already taken (column-pivoted QR); the bar is the size of that remainder over the 128 electrodes, and the patch counts when it exceeds the noise of one contact. Counting the best combinations instead (singular values above the noise, the criterion of the next row) gives the same number to within one for the motor set', cite: '<span class="assumption-tag">model assumption</span>' + c('svd-method') },
    { what: 'Ceiling', value: `the whole cortex tiled with non-overlapping patches of the chosen radius, each with the moment of one patch; the singular values of their scalp patterns are counted above the noise, which is the most patterns of that size any decoder could separate. For comparison, ${COMPONENTS_99} lead-field components carry 99% of the scalp variance of independent, identically distributed point sources (scripts/leadfield_svd.py)`, cite: c('svd-method') + c('svd-counts') },
    { what: 'Added patches', value: 'patches beyond the five motor areas are placed at fixed spots round the top of the head and can be dragged anywhere on the visible cortex; a dragged patch snaps to the nearest cortical source point', cite: '<span class="assumption-tag">model assumption</span>' },
  ]);

  function drawBars(order: { idx: number; rest: number }[], noise: number) {
    const DW = Math.max(420, holder.clientWidth || 0), DH = canvas.height;
    canvas.width = DW; canvas.style.width = `${DW}px`;
    ctx.clearRect(0, 0, DW, DH);
    const ml = 62, mt = 62, mb = 50, mr = 16, plotW = DW - ml - mr; // one row of callouts above the plot
    const vals = order.map((o) => o.rest);
    const lo = Math.log10(noise / 10), hi = Math.log10(Math.max(noise * 20, ...vals, 1e-9) * 2.2);
    const y = (v: number) => mt + (DH - mt - mb) * (1 - (Math.log10(Math.max(v, Math.pow(10, lo))) - lo) / (hi - lo));
    ctx.strokeStyle = '#c3c2b7'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(ml, mt); ctx.lineTo(ml, DH - mb); ctx.lineTo(DW - mr, DH - mb); ctx.stroke();
    ctx.fillStyle = '#52514e'; ctx.font = '12px system-ui, sans-serif'; ctx.textAlign = 'right';
    for (const v of [0.1, 1, 10, 100, 1000]) { if (v < Math.pow(10, lo) || v > Math.pow(10, hi)) continue; ctx.fillText(`${fmt(v, 2)} µV`, ml - 5, y(v) + 4); }
    ctx.textAlign = 'left'; ctx.font = 'bold 12px system-ui, sans-serif'; ctx.fillText('new signal', 4, mt - 8);
    ctx.strokeStyle = '#52514e'; ctx.setLineDash([5, 4]);
    ctx.beginPath(); ctx.moveTo(ml, y(noise)); ctx.lineTo(DW - mr, y(noise)); ctx.stroke();
    ctx.setLineDash([]);
    ctx.font = 'bold 13px system-ui, sans-serif'; ctx.textAlign = 'right'; ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(252,252,251,0.9)';
    ctx.strokeText(`noise floor, ${fmt(noise, 2)} µV`, DW - mr - 2, y(noise) - 5); ctx.fillStyle = '#1a1a1a'; ctx.fillText(`noise floor, ${fmt(noise, 2)} µV`, DW - mr - 2, y(noise) - 5);
    if (!order.length) return;
    const right = DW - mr;
    const slot = Math.min(118, (plotW - 16) / order.length), bw = Math.min(52, slot - 14);
    const xc = (i: number) => ml + 16 + i * slot + slot / 2;
    let firstGrey = -1;
    order.forEach((o, i) => {
      const above = o.rest > noise, p = state.explore[o.idx];
      if (!above && firstGrey < 0) firstGrey = i;
      ctx.fillStyle = above ? patchColour(o.idx) : '#c3c2b7';
      ctx.fillRect(xc(i) - bw / 2, y(o.rest), bw, DH - mb - y(o.rest));
      ctx.fillStyle = above ? '#1a1a1a' : '#898781'; ctx.textAlign = 'center'; ctx.font = slot >= 60 ? 'bold 13px system-ui, sans-serif' : 'bold 11px system-ui, sans-serif';
      ctx.fillText(slot >= 60 ? `${fmt(o.rest, 2)} µV` : fmt(o.rest, 2), xc(i), y(o.rest) - 5);
      ctx.font = '13px system-ui, sans-serif'; ctx.fillStyle = above ? '#1a1a1a' : '#898781';
      ctx.fillText(slot >= 80 ? patchLabel(p, o.idx) : String(o.idx + 1), xc(i), DH - mb + 17);
      if (!above && slot >= 80) ctx.fillText('not counted', xc(i), DH - mb + 33);
    });
    if (firstGrey >= 0) {
      const o = order[firstGrey], p = state.explore[o.idx];
      const lines: TextPart[][] = [[`${p.name ?? `patch ${o.idx + 1}`}: only ${fmt(o.rest, 2)} µV is new, less than the noise,`], ['so from outside it looks like a mix of the others']];
      ctx.font = '13px system-ui, sans-serif';
      const w = Math.max(...lines.map((l) => partsWidth(ctx, l, 13))) + 14;
      callout(ctx, lines, Math.min(Math.max(xc(firstGrey) - w / 2, ml), right - w), 6, xc(firstGrey), y(o.rest) - 24);
    }
  }

  function update() {
    const noise = state.noiseUv;
    const pats = state.explore.map(patchPattern);
    const order = greedyOrder(pats.map((p) => p.a));
    const D = order.filter((o) => o.rest > noise).length;
    cctx.clearRect(0, 0, W, H + FOOT);
    footnote(cctx, H, [['drag a patch to move it; the slider adds or removes patches'], [`each patch: ${fmt(Math.round(state.N), 2)} cells, ${fmt(state.f, 2)} in step, over ${state.radiusMm} mm`], [`${D} of ${state.explore.length} can be told apart at this noise`]]);
    drawCortex(cctx, geo, state.explore);
    drawBars(order, noise);
    rD.set(state.explore.length ? `${D} of ${state.explore.length}` : 'none placed');
    rCeil.set(`${ceilingCount()}`);
    rRecord.set('3');
  }
  // the count slider adds patches at the spare spots or removes the last ones
  sCount.onChange((n) => {
    const target = Math.round(n);
    while (state.explore.length > target) state.explore.pop();
    while (state.explore.length < target) {
      const k = state.explore.length;
      state.explore.push(k < 5 ? MOTOR()[k] : at(...SPARE_SPOTS[k - 5]));
    }
    update();
  });
  // dragging a patch moves it to the nearest cortical source under the pointer
  let dragging = -1;
  cortex.addEventListener('pointerdown', (ev) => {
    const [x, y] = canvasPoint(cortex, ev, W, H + FOOT);
    dragging = patchAt(geo, state.explore, x, y);
    if (dragging >= 0) { cortex.setPointerCapture(ev.pointerId); cortex.style.cursor = 'grabbing'; }
  });
  cortex.addEventListener('pointermove', (ev) => {
    if (dragging < 0) return;
    const [x, y] = canvasPoint(cortex, ev, W, H + FOOT);
    const src = sourceAt(geo, x, y, 20);
    if (src >= 0 && src !== state.explore[dragging].center) { state.explore[dragging] = { ...state.explore[dragging], center: src }; update(); }
  });
  const release = () => { dragging = -1; cortex.style.cursor = ''; };
  cortex.addEventListener('pointerup', release);
  cortex.addEventListener('pointercancel', release);
  subscribe(update);
  new ResizeObserver(() => update()).observe(holder);
  state.explore = MOTOR();
  update();
  void notify;
}
