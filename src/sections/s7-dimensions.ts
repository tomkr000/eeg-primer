import { claimCite as c } from '../data/params';
import { fmt, readout } from '../ui/slider';
import { section, figure, prose, assumptions, readouts } from '../ui/layout';
import { state, subscribe, dimControls, patchPattern, greedyOrder, fullSv, momentNam, patchColour, patchLabel, COMPONENTS_99 } from './dim-model';

/** a boxed note with a pointer line to a spot */
function callout(ctx: CanvasRenderingContext2D, lines: string[], x: number, y: number, tx: number, ty: number, align: 'left' | 'right' = 'left') {
  ctx.save();
  ctx.font = '13px system-ui, sans-serif';
  const w = Math.max(...lines.map((l) => ctx.measureText(l).width)) + 14, h = lines.length * 16 + 8;
  const bx = align === 'right' ? x - w : x;
  const ax = Math.min(Math.max(tx, bx + 8), bx + w - 8), ay = ty > y + h ? y + h : y;
  ctx.strokeStyle = '#1a1a1a'; ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(tx, ty); ctx.stroke();
  ctx.fillStyle = '#1a1a1a'; ctx.beginPath(); ctx.arc(tx, ty, 3, 0, 2 * Math.PI); ctx.fill();
  ctx.fillStyle = 'rgba(252,252,251,0.95)'; ctx.strokeStyle = '#898781'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.roundRect(bx, y, w, h, 4); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#1a1a1a'; ctx.textAlign = 'left';
  lines.forEach((l, i) => ctx.fillText(l, bx + 7, y + 17 + i * 16));
  ctx.restore();
}

export function mountDimensions(root: HTMLElement) {
  const sec = section(root, 'dimensions', '7', 'A head with EEG can operate only a few dimensions', 'Patches whose blobs cannot be told apart do not count');
  prose(sec.text, `
<p>How many independent signals, or dimensions of control, can a head with EEG on it operate? A patch
counts only if its scalp pattern stands above the noise after everything the other patches could produce
has been subtracted; the figure takes the patches of section 6 in turn and does exactly that. Blur caps the
answer whatever is placed: only about 20 to 26 distinct scalp patterns exist at all, however many electrodes
are added ${c('svd-counts')}${c('iivanainen-eigen')}${c('spatial-nyquist')}, because electrodes beyond the
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
  const rCeil = readout('the ceiling: every point of cortex as its own source, same noise', c('svd-method'));
  const rRecord = readout('the record: dimensions people have controlled at will', c('dof-control'));
  const fig = figure(sec.fig, `The patches of section 6 taken in turn, strongest first; each bar is the scalp signal that patch adds which the patches before it cannot mimic, against the noise of one electrode contact ${c('svd-method')}${c('skin-noise')}. The sliders are the same as in section 6 and move together.`, { wide: true });
  const row = document.createElement('div');
  row.className = 'viz-row dims-row';
  row.style.flexWrap = 'nowrap';
  const holder = document.createElement('div');
  holder.className = 'viz-box'; holder.style.flex = '1 1 600px';
  const title = document.createElement('div'); title.className = 'viz-title';
  title.textContent = 'Each patch in turn, strongest first: the new signal it adds that the earlier ones cannot mimic';
  const canvas = document.createElement('canvas'); canvas.className = 'glow'; canvas.height = 320;
  holder.append(title, canvas);
  const verdict = readouts(rD.el, rCeil.el, rRecord.el);
  verdict.className = 'readouts verdict';
  row.append(holder, verdict);
  fig.viz.append(row);
  fig.panel.append(dimControls());
  const ctx = canvas.getContext('2d')!;
  assumptions(fig.el, [
    { what: 'Noise of one contact', value: 'the electrode–skin noise of a single contact, 1 to 20 µV rms as measured; the slider starts at the quietest contact ever measured and marks a typical dry contact; muscle, blinks and mains (section 4) would add to it', cite: c('skin-noise') },
    { what: 'Told apart', value: 'patches are taken in turn, each time the one whose scalp pattern differs most from every combination of those already taken (column-pivoted QR); the bar is the size of that remainder over the 128 electrodes, and the patch counts when it exceeds the noise of one contact. Counting the best combinations instead (singular values above the noise, the criterion of the next row) gives the same number to within one for the presets', cite: '<span class="assumption-tag">model assumption</span>' + c('svd-method') },
    { what: 'Ceiling', value: `singular values of the full lead field, each cortical point carrying the moment of one patch, counted above the noise; ${COMPONENTS_99} lead-field components carry 99% of the scalp variance of independent, identically distributed sources (scripts/leadfield_svd.py)`, cite: c('svd-method') + c('svd-counts') },
  ]);

  function draw(order: { idx: number; rest: number }[], noise: number) {
    const DW = Math.max(560, holder.clientWidth || 0), DH = canvas.height;
    canvas.width = DW; canvas.style.width = `${DW}px`;
    ctx.clearRect(0, 0, DW, DH);
    const ml = 62, mt = 104, mb = 50, mr = 16, plotW = DW - ml - mr; // two rows of callouts above the plot
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
    if (!order.length) { ctx.font = '14px system-ui, sans-serif'; ctx.fillStyle = '#52514e'; ctx.textAlign = 'center'; ctx.fillText('no patches placed: use a preset or click the cortex in section 6', ml + plotW / 2, (mt + DH - mb) / 2); return; }
    const slot = Math.min(118, (plotW - 16) / order.length), bw = Math.min(52, slot - 24);
    const xc = (i: number) => ml + 16 + i * slot + slot / 2;
    let firstGrey = -1, firstBlue = -1;
    order.forEach((o, i) => {
      const above = o.rest > noise, p = state.patches[o.idx];
      if (above && firstBlue < 0) firstBlue = i;
      if (!above && firstGrey < 0) firstGrey = i;
      ctx.fillStyle = above ? patchColour(o.idx) : '#c3c2b7';
      ctx.fillRect(xc(i) - bw / 2, y(o.rest), bw, DH - mb - y(o.rest));
      ctx.fillStyle = above ? '#1a1a1a' : '#898781'; ctx.textAlign = 'center'; ctx.font = 'bold 13px system-ui, sans-serif';
      ctx.fillText(`${fmt(o.rest, 2)} µV`, xc(i), y(o.rest) - 5);
      ctx.font = '13px system-ui, sans-serif'; ctx.fillStyle = above ? '#1a1a1a' : '#898781';
      const name = slot >= 80 ? patchLabel(p, o.idx) : String(o.idx + 1);
      ctx.fillText(name, xc(i), DH - mb + 17);
      if (!above && slot >= 80) ctx.fillText('not counted', xc(i), DH - mb + 33);
    });
    // callouts in two rows above the plot, each pointing straight down at its bar or at the noise line
    const right = DW - mr;
    const boxW = (lines: string[]) => { ctx.font = '13px system-ui, sans-serif'; return Math.max(...lines.map((l) => ctx.measureText(l).width)) + 14; };
    const above = (lines: string[], x: number) => Math.min(Math.max(x - boxW(lines) / 2, ml), right - boxW(lines));
    callout(ctx, [`noise of one electrode contact: ${fmt(noise, 2)} µV`, 'a bar below this line is a mix of the others'], right, 6, right - 4, y(noise), 'right');
    if (firstBlue >= 0) {
      const o = order[firstBlue], lines = [`${fmt(o.rest, 2)} µV that no other patch can mimic:`, 'counts as one dimension'];
      callout(ctx, lines, above(lines, xc(firstBlue)), 6, xc(firstBlue), y(o.rest) - 24);
    }
    if (firstGrey >= 0) {
      const o = order[firstGrey], p = state.patches[o.idx];
      const lines = [`${p.name ?? `patch ${o.idx + 1}`}: only ${fmt(o.rest, 2)} µV is new, less than the noise,`, 'so from outside it looks like a mix of the others'];
      callout(ctx, lines, above(lines, xc(firstGrey)), 52, xc(firstGrey), y(o.rest) - 24);
    }
  }

  function update() {
    const noise = state.noiseUv;
    const pats = state.patches.map(patchPattern);
    const order = greedyOrder(pats.map((p) => p.a));
    const D = order.filter((o) => o.rest > noise).length;
    draw(order, noise);
    rD.set(state.patches.length ? `${D} of ${state.patches.length}` : 'none placed');
    const members = pats.length ? pats[0].members.length : Math.max(1, Math.round(Math.PI * state.radiusMm * state.radiusMm / 50));
    rCeil.set(`${fullSv.filter((v) => (v * momentNam()) / members > noise).length}`);
    rRecord.set('3');
  }
  subscribe(update);
  new ResizeObserver(() => update()).observe(holder);
  update();
}
