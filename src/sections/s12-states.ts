import * as d3 from 'd3';
import { evaluate, seen, D_STAR_90, BANDS, type Band, type Settings } from '../physics/states';
import { MODEL, STATES, REGIONS, REGION_NAMES, BACKGROUND, EMG, G_SCALE } from '../data/states';
import { controls, readout, slider, choice, fmt } from '../ui/slider';
import { linePlot } from '../ui/plot';
import { claimCite as c } from '../data/params';
import { section, figure, prose, readouts, assumptions, sw, vizTitle } from '../ui/layout';

const M = STATES.length;
const DEFAULTS = { N: 4, T: 2 };
/** spread of resting log power between people and its day-to-day reliability per band (claims between-person, test-retest) */
const SPREAD = { betweenSd: 0.65, retest: { slow: 0.66, theta: 0.77, alpha: 0.88, beta: 0.81 } as Record<Band, number> };
/** electrode counts for the curves, log-spaced from 1 to 1,000 */
const NS = Array.from(new Set(Array.from({ length: 31 }, (_, i) => Math.round(Math.pow(1000, i / 30)))));
const fmtN = (n: number) => Math.round(n).toLocaleString('en-US');
const BLUE = '#2a78d6', ORANGE = '#eb6834';
/** cell color: dark for a pair the decoder confuses, white for one it always tells apart */
const ramp = d3.interpolateLab('#1b4d8e', '#fbfbfa');
const cellColor = (acc: number) => ramp(Math.pow(Math.max(0, Math.min(1, (acc - 0.5) / 0.5)), 1.4));
const bandName = (b: Band) => `${BANDS[b][0]} to ${BANDS[b][1]} Hz`;

export function mountStates(root: HTMLElement) {
  const sec = section(root, 'states', '12', 'Named brain states share a few scalp signals', 'Most of the states that studies and products name are read from the same band powers, so one reading confuses them');
  prose(sec.text, `
<p>Products are sold as readers of focus, calm, stress, meditation depth and drowsiness, and studies classify
workload, fatigue, emotions, memory load, mind wandering, sleep stages (light, deep and rapid eye movement (REM) sleep) and
the depth of anesthesia ${c('consumer-states')}${c('state-accuracies')}.
These labels are chosen before the recording. This section asks how many of them one reading of scalp EEG can tell
apart, and what the cap, the window and the baseline change.</p>
<p>Nearly every named state is read from the power of a few rhythms at a few places. Posterior alpha rises about
four-fold when the eyes close ${c('eyes-closed-alpha')} and falls with mental work ${c('workload-signature')},
stress ${c('stress-signature')} and attention ${c('focus-indices')}; frontal theta rises with workload
${c('workload-signature')}, drowsiness ${c('drowsiness-signature')}, items held in memory
${c('memory-retention-signature')}, mind wandering ${c('mind-wandering-signature')} and, in some studies, meditation
${c('meditation-signature')}; “attention” and “engagement” scores are ratios of beta to alpha and theta
${c('focus-indices')}; emotional valence is read from the left-right balance of frontal alpha, where the measured
shifts are small ${c('valence-asymmetry')}${c('arousal-signature')}; sleep stages are scored from slow waves and the
loss of alpha ${c('sleep-stages')}, and propofol brings frontal alpha and slow waves ${c('anesthesia-signature')}.
So several labels sit on one axis: workload, stress, excitement and focus all lower alpha; drowsiness, meditation,
memory load and mind wandering all raise theta. Relaxation has no agreed signature at all ${c('relaxation-signature')}.</p>
<p>The model gives each state a set of power factors at eight regions of the section 3 sphere ${c('state-table')},
reads every region through N electrodes with the estimator of section 11 ${c('states-model')}, and takes the log
band powers of one window as the decoder’s features. One reading of a band B hertz wide over T seconds scatters by
about 1/√(BT) ${c('erd-detect')}; a baseline from another day adds the day-to-day change of a person’s power
${c('test-retest')}, and no baseline adds the spread between people ${c('between-person')}; blinks and muscle are
left in and add their own fluctuation ${c('blink-model')}${c('emg-beta-level')}, which turns out to change no pair by
more than two percentage points ${c('artifact-effect')}. Two states count as told apart when a linear decoder calls
nine readings in ten correctly ${c('states-model')}.</p>
<p>With the defaults (four electrodes, a 2 s window, a same-session baseline) the model tells apart
only a handful of the ${M} named states, and the ones it confuses are those that share an axis ${c('states-count')}.
More electrodes raise the number of states the eight features could hold, because the cap separates the alpha-band
regions, but add little to the count of named states, whose signatures differ by less than one reading’s scatter. A
longer window helps most; losing the baseline hurts most. Measured results sit where the model puts them: two workload
levels at 76% from 2 s windows and about 95% from 30 s within a person, and markedly lower without the person’s own
data ${c('state-accuracies')}; valence and arousal near 58 and 62% from minute-long trials ${c('arousal-signature')};
sleep stages at 82 to 86% from 30 s epochs ${c('sleep-scoring-agreement')}.</p>
<p>The model leaves out what some decoders use: spindles, K complexes and evoked responses, phase and connectivity,
and learning over sessions. It also treats each state as a fixed point, whereas the labels come from self-report and
the rhythms fluctuate more than a Gaussian process does ${c('rhythm-fluctuation')}. It is a floor set by physics and
statistics for band-power readings, not a verdict on every method.</p>`);

  const TRACK = 255;
  const sN = slider({ label: 'Number of electrodes', min: 1, max: 1000, value: DEFAULTS.N, log: true, format: fmtN, trackPx: TRACK, marks: [{ value: 4, label: 'Headband' }, { value: 21, label: '10–20', align: 'center' }, { value: 128, label: 'Research cap' }], note: c('cap-lattice') + c('consumer-electrodes') + c('eeg-systems') });
  const sWin = slider({ label: 'Window for one reading', unit: 's', min: 1, max: 60, value: DEFAULTS.T, log: true, format: (v) => fmt(v, 2), trackPx: TRACK, marks: [{ value: 2, label: 'Default' }, { value: 30, label: 'Sleep epoch', align: 'end' }], note: c('erd-detect') + c('sleep-stages') });
  let calibration: Settings['calibration'] = 'session';
  const pickCal = choice('Baseline the decoder was calibrated on', [{ value: 'session', label: 'This session' }, { value: 'day', label: 'Another day' }, { value: 'none', label: 'Other people' }], 'session', (v) => { calibration = v; update(); });

  const rApart = readout('Named states one reading tells apart', c('states-count'));
  const rWorst = readout('Hardest pair, numbered as in the matrix', c('states-count'));
  const rCells = readout('States the eight features could hold', c('states-count'));
  const rStep = readout('Smallest change of posterior alpha told apart', c('erd-detect'));

  const fig = figure(sec.fig, `Left: for every pair of named states, the share of single readings that a linear decoder on the eight log band powers calls correctly, both states equally likely, computed from the separation d′ of the two states’ feature means in their reading-to-reading covariance as Φ(d′/2) ${c('states-model')}. Dark cells are pairs the decoder confuses, white cells pairs it always separates; a dot marks the largest set of states that are pairwise told apart in nine readings of ten. Right: that count (${sw(ORANGE, 'line')}) and an estimate of how many states the eight features could hold at the same resolution (${sw(BLUE, 'line')}), against the number of electrodes at the current window and baseline; the vertical line follows the electrode slider ${c('states-count')}. The electrodes are the first N of a fixed, evenly spread sequence within 80° of the vertex of the section 3 head sphere ${c('cap-lattice')}. Each state’s factors come from the studies cited in the assumptions table ${c('state-table')}; the measured classifier accuracies stay in the text because their caps, windows and labels differ from this model.`, { wide: true });
  const lede = document.createElement('p');
  lede.className = 'figure-lede';
  lede.innerHTML = `<strong>Model of reading named states from one window of EEG.</strong> States that differ by less than one reading’s scatter are confused, whatever the cap ${c('erd-detect')}${c('states-model')}.`;
  fig.el.prepend(lede);

  const row = document.createElement('div');
  row.className = 'viz-row';
  row.style.flexWrap = 'nowrap';
  fig.viz.append(row);

  // the matrix of pairwise accuracies
  const CELL = 15, LW = 196, TOP = 18, PAD = 4;
  const W = LW + M * CELL + PAD, H = TOP + M * CELL + PAD;
  const matBox = document.createElement('div');
  matBox.className = 'viz-box';
  matBox.style.flex = `0 0 ${W}px`;
  matBox.append(vizTitle('Share of readings that tell each pair of named states apart'));
  const cv = document.createElement('canvas');
  const DPR = Math.min(2, window.devicePixelRatio || 1);
  cv.width = W * DPR; cv.height = H * DPR; cv.style.width = `${W}px`; cv.style.height = `${H}px`;
  const ctx = cv.getContext('2d')!;
  ctx.scale(DPR, DPR);
  const legend = document.createElement('div');
  legend.className = 'glow-legend';
  legend.innerHTML = [0.5, 0.7, 0.9, 1].map((a) => `<span><i class="sw-i sw-patch" style="background:${cellColor(a)};border:1px solid #c9c8c2"></i>${Math.round(a * 100)}%${a === 0.5 ? ' (guessing)' : a === 0.9 ? ' (told apart)' : ''}</span>`).join('') + `<span class="note">● in the largest set told apart</span>`;
  matBox.append(cv);
  const tip = document.createElement('div');
  tip.className = 'tooltip';
  tip.style.display = 'none';
  matBox.style.position = 'relative';
  matBox.append(tip);
  row.append(matBox);

  // the counts against electrode count
  const plotBox = document.createElement('div');
  plotBox.className = 'viz-box';
  plotBox.style.flex = '1 1 360px';
  plotBox.append(vizTitle('States told apart in one reading, against number of electrodes'));
  const plotBox2 = plotBox;
  let plot = linePlot(plotBox2, { x: { label: 'Electrodes within 80° of the vertex', tip: 'Electrodes', scale: 'log', domain: [1, 1000] }, y: { label: 'Number of states', scale: 'log', domain: [1, 1e4] }, height: H - 26, margin: { right: 24 } });
  let yTop = 1e4;
  row.append(plotBox);
  fig.viz.append(legend);

  fig.viz.append(readouts(rApart.el, rWorst.el, rCells.el, rStep.el));
  const ctl = controls(sN.el, sWin.el, pickCal.el);
  ctl.classList.add('aligned-controls');
  fig.panel.append(ctl);
  const regionRows = REGIONS.map((r) => `${REGION_NAMES[r.id]} (${bandName(r.band)}, ${r.radiusMm} mm radius, ${fmt(r.restUv, 2)} µV rms at rest)`).join('; ');
  assumptions(fig.el, [
    { what: 'Regions', value: `Eight discs of radial dipoles on the section 3 cortex sphere, each carrying one rhythm whose root-mean-square amplitude at the scalp straight above it, at eyes-open rest, is: ${regionRows}. The alpha regions follow section 7’s 20 µV eyes-closed alpha divided by the eyes-closed factor; the hand areas carry mu at that alpha strength, which is optimistic. Broad rhythms get broad discs, a modeling choice.`, cite: c('rest-amplitudes') + c('alpha-source-chain') + c('mu-vs-alpha') + c('eyes-closed-alpha') },
    { what: 'Named states', value: `Power factors relative to eyes-open rest, listed with their sources in claim state-table. Where a source gives only a standardized effect size g, the factor is exp(${G_SCALE} g).`, cite: c('state-table') + c('g-to-ratio') },
    { what: 'Head and electrodes', value: 'The layered sphere of section 3. The N electrodes are the first N of a fixed sequence within 80° of the vertex: the vertex, then each next one at the position farthest from those already placed (ties to the midline, the face and the left), so the first five are like Cz, Fpz, Oz, T7 and T8 and a larger array always contains the smaller one. The readings assume an ideal distant reference, as in section 11.', cite: c('cap-lattice') + c('count-model') },
    { what: 'Brain background and electrode noise', value: `The brain’s own activity in each band at one electrode: ${(Object.keys(BANDS) as Band[]).map((b) => `${fmt(BACKGROUND[b], 2)} µV rms at ${bandName(b)}`).join(', ')}, spatially correlated as independent cortical sources seen through the same head, as in section 11. Electrode noise is white at 1 µV rms per 3 Hz band.`, cite: c('band-background') + c('brain-background') + c('skin-noise') },
    { what: 'Reading', value: 'In each band the decoder forms the minimum-mean-square estimate of every region’s rhythm from the electrodes, given the regions’ typical powers, so regions the cap resolves are canceled from each other’s estimates and regions it cannot resolve mix. The features are the log powers of those estimates over the window; their reading-to-reading covariance follows the gamma model with shape B·T (the trigamma function gives the exact variance of a log gamma variate), including the correlation of estimates that share a source.', cite: c('states-model') + c('erd-detect') + c('snr-electrodes') },
    { what: 'Baseline', value: `“This session”: the decoder knows the person’s resting levels today. “Another day”: each region’s log power has moved since, by the day-to-day share 1 − ICC of the between-person variance (ICC the intraclass correlation between days), counted for both days. “Other people”: the decoder knows only the population, so each region’s resting log power is uncertain by ${SPREAD.betweenSd} natural-log units. The state’s factors are the same for everyone, an optimistic choice.`, cite: c('between-person') + c('test-retest') },
    { what: 'Artifacts', value: `Left in, as recorded. Blinks: a broad source in front of the brain, 15 a minute while the eyes are open, each section 7’s 150 µV deflection, their number per window Poisson; muscle: three sources at the forehead and the temples with ${EMG.uvRms} µV rms of beta at the scalp above them, their level varying between windows by a factor exp(±${EMG.logSd}). Both leak into the estimates. Canceling them instead changes no pair’s accuracy by more than two percentage points at any setting of the sliders, so there is no control for it: with the electrodes of this layout away from the eyes and the muscles, the blink’s energy sits below 4 Hz where the brain’s own background is largest, and the beta changes between named states are small.`, cite: c('blink-model') + c('emg-beta-level') + c('artifact-effect') },
    { what: 'Told apart', value: 'Two states are told apart when d′, the separation of their feature means in their mean covariance, reaches 2.56, so that a linear decoder calls nine equally likely readings in ten correctly (Φ(d′/2) = 0.9). The named-state count is the largest set that is pairwise told apart. The “could hold” estimate takes the box each region’s log power spans across the named states, maps it through the cap at its center, whitens it by the reading’s covariance and counts cells 2.56 wide along each principal direction (1 + extent/2.56 per direction, multiplied), exact for independent features.', cite: c('states-model') },
    { what: 'Window range', value: 'The slider runs from 1 to 60 s, with a 2 s default (a model choice) and a mark at the 30 s sleep-scoring epoch; below 1 s the gamma model’s shape would fall under 3.5 in the slowest band.', cite: c('sleep-stages') + c('erd-detect') },
    { what: 'Electrode marks', value: 'Four electrodes, as on a consumer headband with four recording sites; 21, the positions of the 10–20 system; 128, a research cap.', cite: c('consumer-electrodes') + c('eeg-systems') },
  ]);

  const settings = (N = sN.value, T = sWin.value): Settings => ({ N: Math.round(N), T, calibration, artifacts: 'present', betweenSd: SPREAD.betweenSd, retest: SPREAD.retest, dStar: D_STAR_90 });
  let acc: Float64Array = new Float64Array(M * M), apart: number[] = [];

  function drawMatrix() {
    ctx.clearRect(0, 0, W, H);
    ctx.textBaseline = 'middle';
    for (let i = 0; i < M; i++) {
      const y = TOP + i * CELL, cy = y + CELL / 2 + 0.5;
      ctx.font = '12px system-ui, sans-serif';
      ctx.textAlign = 'right';
      ctx.fillStyle = '#1a1a1a';
      ctx.fillText(STATES[i].name, LW - 9, cy);
      if (apart.includes(i)) { ctx.beginPath(); ctx.arc(LW - 4, cy, 2.4, 0, 2 * Math.PI); ctx.fill(); }
      ctx.font = '11px system-ui, sans-serif';
      ctx.fillStyle = '#4a4a46';
      ctx.fillText(String(i + 1), 17, cy);
      ctx.textAlign = 'center';
      ctx.fillText(String(i + 1), LW + i * CELL + CELL / 2, TOP / 2 + 1);
      for (let j = 0; j < M; j++) {
        const x = LW + j * CELL;
        ctx.fillStyle = i === j ? '#e4e3df' : cellColor(acc[i * M + j]);
        ctx.fillRect(x + 0.5, y + 0.5, CELL - 1, CELL - 1);
      }
    }
    ctx.strokeStyle = '#c9c8c2';
    ctx.lineWidth = 1;
    ctx.strokeRect(LW + 0.5, TOP + 0.5, M * CELL - 1, M * CELL - 1);
  }
  cv.addEventListener('mousemove', (ev) => {
    const r = cv.getBoundingClientRect(), x = ev.clientX - r.left, y = ev.clientY - r.top;
    const j = Math.floor((x - LW) / CELL), i = Math.floor((y - TOP) / CELL);
    if (i < 0 || j < 0 || i >= M || j >= M || i === j) { tip.style.display = 'none'; return; }
    tip.style.display = 'block';
    tip.innerHTML = `<b>${STATES[i].name}</b> vs <b>${STATES[j].name}</b>: ${fmt(100 * acc[i * M + j], 3)}% of readings called correctly`;
    tip.style.left = `${Math.min(x + 12, W - 260)}px`;
    tip.style.top = `${y + 18}px`;
  });
  cv.addEventListener('mouseleave', () => { tip.style.display = 'none'; });

  function update() {
    const set = settings(), out = evaluate(MODEL, STATES, set);
    acc = out.acc; apart = out.apart;
    drawMatrix();
    const held: [number, number][] = [], told: [number, number][] = [];
    for (const N of NS) { const o = evaluate(MODEL, STATES, settings(N)); held.push([N, o.cells]); told.push([N, Math.max(1, o.apart.length)]); }
    const top = Math.pow(10, Math.max(3, Math.ceil(Math.log10(Math.max(...held.map((p) => p[1]))))));
    if (top !== yTop) { yTop = top; plotBox2.querySelector('.plot')?.remove(); plot = linePlot(plotBox2, { x: { label: 'Electrodes within 80° of the vertex', tip: 'Electrodes', scale: 'log', domain: [1, 1000] }, y: { label: 'Number of states', scale: 'log', domain: [1, top] }, height: H - 26, margin: { right: 24 } }); }
    plot.update([
      { name: 'States the eight features could hold', points: held, color: BLUE, width: 2.5 },
      { name: 'Named states told apart (9 readings in 10)', points: told, color: ORANGE, width: 2.5 },
    ], [
      { axis: 'y', value: M, label: `${M} named states` },
      { axis: 'x', value: set.N, label: `${fmtN(set.N)} electrodes`, callout: true },
    ]);
    rApart.set(`${out.apart.length} of ${M}`);
    const [a, b] = out.worst;
    rWorst.set(`${fmt(100 * out.acc[a * M + b], 2)}% <span class="readout-aside">${a + 1} vs ${b + 1}</span>`);
    rCells.set(fmtN(out.cells));
    const rest = seen(MODEL, STATES[0], set), k = REGIONS.findIndex((r) => r.id === 'alphaP');
    rStep.set(`×${fmt(Math.exp(set.dStar * Math.sqrt(rest.cov[k * REGIONS.length + k])), 2)}`);
  }
  [sN, sWin].forEach((s) => s.onChange(update));
  // the first evaluation runs after the page has painted
  requestAnimationFrame(() => setTimeout(update, 0));
}
