import { claimCite as c } from '../data/params';
import { fmt, readout, slider } from '../ui/slider';
import { section, figure, prose, assumptions, readouts } from '../ui/layout';
import { textWithSwatches, partsWidth, type TextPart } from '../ui/field';
import { state, subscribe, notify, dimControls, patchPattern, greedyOrder, ceilingCount, whiten, bitsPerSecond, snrForBits, WINDOW_S, WINDOW_GAIN, BAND_HZ, patchColour, patchLabel, MOTOR, SPARE_SPOTS, at, COMPONENTS_99 } from './dim-model';
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

const W = 330, H = 300, FOOT = 46;
const geo = headGeometry(W, H);

export function mountDimensions(root: HTMLElement) {
  const sec = section(root, 'dimensions', '7', 'A head with EEG can operate only a few dimensions', 'Patches whose blobs cannot be told apart do not count');
  prose(sec.text, `
<p>How many independent signals, or dimensions of control, can a head with EEG on it operate? Each area a
person can modulate at will is read against the brain's own activity in the same band, 10 to 100 µV at the
scalp ${c('eeg-amplitude')}, within about a second. The figure takes the patches in turn and asks, for each,
how much of its scalp pattern the earlier patches cannot produce, measured against that background plus one
contact's noise with the best linear detector ${c('whitened-snr')}, and credited with the √(2BT) that a 3 Hz
band gives over a 1 s window ${c('window-samples')}. A patch counts when that signal-to-noise ratio (SNR)
exceeds 1; the bits per second it could carry follow from the SNR ${c('channel-bits')}. Blur, the other
limit, caps the number of distinct scalp patterns at a few dozen at these signal levels, far more than
volition supplies ${c('svd-counts')}${c('iivanainen-eigen')}${c('spatial-nyquist')}; blind decomposition
of real 71-channel EEG yields about 34 near-dipolar components ${c('ica-dipolar')}.</p>
<p>The record agrees. Four-class motor imagery in cued trials carries about 0.15 bits/s ${c('mi-bitrate')};
the best interfaces of 2002 managed 10 to 25 bits per minute ${c('itr-2002')}; volitional control from
sensorimotor rhythms has reached three independent dimensions ${c('dof-control')}; the fastest spellers reach
about 5 bits/s only by decoding responses to flickering targets chosen by gaze, a selection rather than a
dimension of control ${c('itr-ssvep')}; attempts to read limb trajectories from EEG did not beat chance
${c('kinematics-chance')}. Each dimension is also read from about a second of signal (section 8).
Intracortical arrays, for comparison, decode handwriting at 90 characters/min and speech at 62 words/min
${c('intracortical')}.</p>`);

  const rD = readout(`patches above SNR 1 in a ${WINDOW_S} s window: dimensions a decoder could use`);
  const rBits = readout('bits per second the best patch could carry', c('channel-bits'));
  const rCeil = readout('the ceiling: patterns above SNR 1 if the whole cortex were patches this size', c('svd-method'));
  const rRecord = readout('the record: dimensions people have controlled at will', c('dof-control'));
  const fig = figure(sec.fig, `Left: the patches, starting from the motor set of section 4; drag one to move it, and the slider adds patches (placed round the top of the head) or removes them. Right: the patches taken in turn, strongest first; each bar is the signal-to-noise ratio (SNR) of what that patch adds beyond the earlier patches, read by the best linear detector against the brain's in-band background plus one contact's noise over a ${WINDOW_S} s window in a ${BAND_HZ} Hz band ${c('whitened-snr')}${c('window-samples')}${c('brain-background')}${c('skin-noise')}; the right axis converts SNR to bits per second ${c('channel-bits')}, with the rates reached by real interfaces marked ${c('mi-bitrate')}${c('itr-2002')}${c('itr-ssvep')}. The N, synchrony and radius sliders are the same as in section 4 and move together.`, { wide: true });
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
  title.textContent = `SNR of what each patch adds beyond the earlier patches, strongest first (${WINDOW_S} s window)`;
  const canvas = document.createElement('canvas'); canvas.className = 'glow'; canvas.height = 322;
  holder.append(title, canvas);
  row.append(cortexBox, holder);
  const verdict = readouts(rD.el, rBits.el, rCeil.el, rRecord.el);
  verdict.style.gridTemplateColumns = 'repeat(4, 1fr)';
  fig.viz.append(row, verdict);
  const sCount = slider({ label: 'Number of patches', min: 1, max: 5 + SPARE_SPOTS.length, step: 1, value: 5, marks: [{ value: 5, label: 'Motor set' }] });
  fig.panel.append(dimControls({ noise: false, background: true, extra: [sCount.el] }));
  const ctx = canvas.getContext('2d')!;
  assumptions(fig.el, [
    { what: 'Noise', value: `the brain's own activity in the band, ${state.backgroundUv} µV rms per electrode by default (slider), spatially correlated as independent cortical sources through the same lead field, plus one contact's noise, ${state.noiseUv} µV white (the quietest measured; muscle, blinks and mains of section 5 would add more)`, cite: c('brain-background') + c('skin-noise') },
    { what: 'SNR of a patch', value: `patches are taken in turn, each time the one whose scalp pattern differs most from every combination of those already taken (column-pivoted QR in whitened coordinates); the bar is the norm of that remainder in units of the noise, which is the single-sample SNR of the optimal detector, times √(2BT) = ${fmt(WINDOW_GAIN, 2)} for a ${BAND_HZ} Hz band over ${WINDOW_S} s (the coherent gain of a detector that knows the waveform, an upper bound; an energy detector on band power gains less)`, cite: c('whitened-snr') + c('window-samples') },
    { what: 'Bits per second', value: `0.5 · log₂(1 + SNR²) per window of ${WINDOW_S} s, the Gaussian-channel capacity for one decision per window (a lower bound on what the band could carry); the marked rates are 0.15 bits/s for four-class imagery, 25 bits/min for the best interfaces of 2002 and 5.32 bits/s for a flicker speller`, cite: c('channel-bits') + c('mi-bitrate') + c('itr-2002') + c('itr-ssvep') },
    { what: 'A patch', value: 'all cortical sources within the radius of a centre point, with equal moments per source scaled so that their vector sum is the stated net moment along the mean cortical normal (a coherent dipole); the vector sum is floored at a fifth of the member count', cite: c('single-cell-moment') + c('variances-add') },
    { what: 'Ceiling', value: `the whole cortex tiled with non-overlapping patches of the chosen radius, each a coherent dipole of the same moment; the singular values of their whitened scalp patterns, times √(2BT), are counted above 1. This is a signal-to-noise statement at the current settings, not a resolution limit: it rises with the source strength. For comparison, ${COMPONENTS_99} lead-field components carry 99% of the scalp variance of independent, identically distributed point sources (scripts/leadfield_svd.py)`, cite: c('svd-method') + c('svd-counts') },
    { what: 'Added patches', value: 'patches beyond the five motor areas are placed at fixed spots round the top of the head and can be dragged anywhere on the visible cortex; a dragged patch snaps to the nearest cortical source point', cite: '<span class="assumption-tag">model assumption</span>' },
  ]);

  const RATES: [number, string][] = [[5.32, 'flicker speller, 5.3'], [25 / 60, 'best of 2002, 0.42'], [0.15, 'four-class imagery, 0.15']];
  function drawBars(order: { idx: number; rest: number }[]) {
    const DW = Math.max(420, holder.clientWidth || 0), DH = canvas.height;
    canvas.width = DW; canvas.style.width = `${DW}px`;
    ctx.clearRect(0, 0, DW, DH);
    const ml = 112, mt = 62, mb = 50, mr = 190, plotW = DW - ml - mr; // one row of callouts above the plot, the bits axis at the right
    const snrs = order.map((o) => o.rest);
    const lo = Math.log10(0.1), hi = Math.log10(Math.max(60, ...snrs) * 1.6);
    const y = (v: number) => mt + (DH - mt - mb) * (1 - (Math.log10(Math.max(v, Math.pow(10, lo))) - lo) / (hi - lo));
    ctx.strokeStyle = '#c3c2b7'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(ml, mt); ctx.lineTo(ml, DH - mb); ctx.lineTo(DW - mr, DH - mb); ctx.lineTo(DW - mr, mt); ctx.stroke();
    ctx.fillStyle = '#52514e'; ctx.font = '12px system-ui, sans-serif'; ctx.textAlign = 'right';
    for (const v of [0.1, 10, 100, 1000]) { if (v > Math.pow(10, hi)) continue; ctx.fillText(fmt(v, 2), ml - 5, y(v) + 4); }
    ctx.font = 'bold 13px system-ui, sans-serif'; ctx.fillStyle = '#1a1a1a'; ctx.fillText('1 = noise floor', ml - 5, y(1) + 4);
    ctx.textAlign = 'left'; ctx.font = 'bold 12px system-ui, sans-serif'; ctx.fillText('SNR', 4, mt - 8);
    ctx.fillText('bits/s', DW - mr + 6, mt - 8);
    // the right axis: bits per second at this SNR, with the rates of real interfaces as lines across the plot
    ctx.font = '12px system-ui, sans-serif'; ctx.fillStyle = '#52514e';
    for (const b of [0.1, 0.5, 1, 2, 4, 8]) { const v = snrForBits(b); if (v < Math.pow(10, lo) || v > Math.pow(10, hi)) continue; ctx.fillText(String(b), DW - mr + 6, y(v) + 4); }
    for (const [bps, label] of RATES) {
      const v = snrForBits(bps); if (v < Math.pow(10, lo) || v > Math.pow(10, hi)) continue;
      ctx.strokeStyle = '#898781'; ctx.setLineDash([2, 4]); ctx.beginPath(); ctx.moveTo(ml, y(v)); ctx.lineTo(DW - mr, y(v)); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = '#52514e'; ctx.textAlign = 'left'; ctx.fillText(label, DW - mr + 34, y(v) + 4);
    }
    ctx.strokeStyle = '#1a1a1a'; ctx.setLineDash([5, 4]); ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(ml, y(1)); ctx.lineTo(DW - mr, y(1)); ctx.stroke();
    ctx.setLineDash([]); ctx.lineWidth = 1;
    if (!order.length) return;
    const right = DW - mr;
    const slot = Math.min(110, (plotW - 16) / order.length), bw = Math.min(48, slot - 14);
    const xc = (i: number) => ml + 16 + i * slot + slot / 2;
    let firstGrey = -1;
    order.forEach((o, i) => {
      const above = o.rest > 1, p = state.explore[o.idx];
      if (!above && firstGrey < 0) firstGrey = i;
      ctx.fillStyle = above ? patchColour(o.idx) : '#c3c2b7';
      ctx.fillRect(xc(i) - bw / 2, y(o.rest), bw, DH - mb - y(o.rest));
      ctx.fillStyle = above ? '#1a1a1a' : '#898781'; ctx.textAlign = 'center'; ctx.font = slot >= 60 ? 'bold 13px system-ui, sans-serif' : 'bold 11px system-ui, sans-serif';
      ctx.fillText(fmt(o.rest, 2), xc(i), y(o.rest) - 5);
      ctx.font = '13px system-ui, sans-serif'; ctx.fillStyle = above ? '#1a1a1a' : '#898781';
      ctx.fillText(slot >= 80 ? patchLabel(p, o.idx) : String(o.idx + 1), xc(i), DH - mb + 17);
      if (!above && slot >= 80) ctx.fillText('not counted', xc(i), DH - mb + 33);
    });
    if (firstGrey >= 0) {
      const o = order[firstGrey], p = state.explore[o.idx];
      const lines: TextPart[][] = [[`${p.name ?? `patch ${o.idx + 1}`}: SNR ${fmt(o.rest, 2)} for what it adds, below 1,`], ['so from outside it is lost in the others and the background']];
      ctx.font = '13px system-ui, sans-serif';
      const w = Math.max(...lines.map((l) => partsWidth(ctx, l, 13))) + 14;
      callout(ctx, lines, Math.min(Math.max(xc(firstGrey) - w / 2, ml), right - w), 6, xc(firstGrey), y(o.rest) - 32);
    }
  }

  function update() {
    const pats = state.explore.map(patchPattern);
    const order = greedyOrder(pats.map((p) => whiten(p.a))).map((o) => ({ idx: o.idx, rest: o.rest * WINDOW_GAIN }));
    const D = order.filter((o) => o.rest > 1).length;
    cctx.clearRect(0, 0, W, H + FOOT);
    footnote(cctx, H, [['drag a patch to move it; the slider adds or removes'], [`each patch: ${fmt(Math.round(state.N), 2)} cells, ${fmt(state.f, 2)} in step, over ${state.radiusMm} mm`], [`${D} of ${state.explore.length} stand above the noise in a ${WINDOW_S} s window`]]);
    drawCortex(cctx, geo, state.explore);
    drawBars(order);
    rD.set(state.explore.length ? `${D} of ${state.explore.length}` : 'none placed');
    rBits.set(order.length ? fmt(bitsPerSecond(order[0].rest), 2) : '0');
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
