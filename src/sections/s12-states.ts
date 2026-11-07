import * as d3 from 'd3';
import { evaluate, seen, D_STAR_90, BANDS, type Band, type Settings } from '../physics/states';
import { MODEL, STATES, REGIONS, REGION_NAMES, BACKGROUND, EMG, G_SCALE, signature, type Area, type Rhythm } from '../data/states';
import { controls, readout, slider, choice, fmt } from '../ui/slider';
import { linePlot } from '../ui/plot';
import { claimCite as c } from '../data/params';
import { section, figure, prose, readouts, assumptions, sw, vizTitle } from '../ui/layout';

const M = STATES.length;
const DEFAULTS = { N: 4, T: 2 };
/** spread of resting log power between people and its day-to-day reliability per band (claims between-person, test-retest) */
const SPREAD = { betweenSd: 0.65, retest: { slow: 0.66, theta: 0.77, alpha: 0.88, beta: 0.81 } as Record<Band, number> };
/** electrode counts for the curves, log-spaced from 1 to 100,000 */
const N_MAX = 100000;
const NS = Array.from(new Set(Array.from({ length: 41 }, (_, i) => Math.round(Math.pow(N_MAX, i / 40)))));
const fmtN = (n: number) => Math.round(n).toLocaleString('en-US');
/** told apart (the count and the line) and the signals the cap resolves */
const TOLD = '#1a1a1a', SIGNALS = '#9a9994';
/** the rhythm hues of section 6, and one per area for the squares */
const RHYTHM_COLOR: Record<Rhythm, string> = { 'slow waves': '#6250d6', theta: '#1baf7a', alpha: '#2a78d6', mu: '#eb6834', beta: '#898781' };
const AREA_COLOR: Record<Area, string> = { posterior: '#d6336c', frontal: '#0b7285', 'hand areas': '#8a6d3b' };
const SIGNATURES = STATES.map(signature);
/** a small triangle, up or down, as inline SVG for the legend */
const tri = (color: string, up: boolean) => `<svg class="sw-i" width="11" height="11" viewBox="0 0 11 11"><path d="${up ? 'M5.5 1 L10.5 10 L0.5 10 Z' : 'M0.5 1 L10.5 1 L5.5 10 Z'}" fill="${color}"/></svg>`;
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
More electrodes let the cap resolve more of the eight regions as independent signals, one at four electrodes and six
from seventeen on, but add little to the count of named states, whose signatures differ by less than one reading’s
scatter. A
longer window helps most; losing the baseline hurts most. Measured results sit where the model puts them: two workload
levels at 76% from 2 s windows and about 95% from 30 s within a person, and markedly lower without the person’s own
data ${c('state-accuracies')}; valence and arousal near 58 and 62% from minute-long trials ${c('arousal-signature')};
sleep stages at 82 to 86% from 30 s epochs ${c('sleep-scoring-agreement')}.</p>
<p>The model leaves out what some decoders use: spindles, K complexes and evoked responses, phase and connectivity,
and learning over sessions. It also treats each state as a fixed point, whereas the labels come from self-report and
the rhythms fluctuate more than a Gaussian process does ${c('rhythm-fluctuation')}. It is a floor set by physics and
statistics for band-power readings, not a verdict on every method.</p>`);

  const TRACK = 300;
  const sN = slider({ label: 'Number of electrodes', min: 1, max: N_MAX, value: DEFAULTS.N, log: true, format: fmtN, trackPx: TRACK, marks: [{ value: 4, label: 'Headband', align: 'center' }, { value: 21, label: '10–20' }, { value: 128, label: 'Research cap' }], note: c('cap-lattice') + c('consumer-electrodes') + c('eeg-systems') });
  const sWin = slider({ label: 'Window for one reading', unit: 's', min: 1, max: 60, value: DEFAULTS.T, log: true, format: (v) => fmt(v, 2), trackPx: TRACK, marks: [{ value: 2, label: 'Default' }, { value: 30, label: 'Sleep epoch', align: 'end' }], note: c('erd-detect') + c('sleep-stages') });
  let calibration: Settings['calibration'] = 'session';
  const pickCal = choice('Baseline the decoder was calibrated on', [{ value: 'session', label: 'This session' }, { value: 'day', label: 'Another day' }, { value: 'none', label: 'Other people' }], 'session', (v) => { calibration = v; update(); });

  const rApart = readout('Named states one reading tells apart', c('states-count'));
  const rAxes = readout('Independent signals one reading resolves', c('states-count'));
  const rStep = readout('Smallest change of posterior alpha told apart', c('erd-detect'));

  const fig = figure(sec.fig, `Left: each named state where the cap reads it, its posterior alpha and frontal theta power as estimated from the N electrodes (section 11’s estimator, which cancels the other regions as far as the cap resolves them and otherwise mixes them), relative to the eyes-open reading ${c('states-model')}. The dashed ellipse is one reading’s scatter in these two readings, 2.56 standard deviations each way: two states closer than its width are confused on these readings; it follows the hovered state. A ring marks the largest set of states that are pairwise told apart in nine readings of ten, by all eight readings: the sleep stages and anesthesia are separated by their slow waves, the hand movements by mu and the moods, when they are, by frontal alpha, none of which this plane shows. States the cap reads at the same place share one label. Beside each name, a triangle gives the rhythm and direction of the state’s largest change, and the dot’s color the area of that change, read off the state table ${c('state-table')}. Right: that count (${sw(TOLD, 'line')}) and the number of independent signals the cap resolves (${sw(SIGNALS, 'line')}): directions of the eight-region feature space along which one reading tells the named states’ extremes apart, so at most eight, against the number of electrodes at the current window and baseline; the vertical line follows the electrode slider ${c('states-count')}. The electrodes are the first N of a fixed, evenly spread sequence within 80° of the vertex of the section 3 head sphere ${c('cap-lattice')}. Each state’s factors come from the studies cited in the assumptions table ${c('state-table')}; the measured classifier accuracies stay in the text because their caps, windows and labels differ from this model.`, { wide: true });
  const lede = document.createElement('p');
  lede.className = 'figure-lede';
  lede.innerHTML = `<strong>Model of reading named states from one window of EEG.</strong> States that differ by less than one reading’s scatter are confused, whatever the cap ${c('erd-detect')}${c('states-model')}.`;
  fig.el.prepend(lede);

  const row = document.createElement('div');
  row.className = 'viz-row';
  row.style.flexWrap = 'nowrap';
  fig.viz.append(row);

  // the map: each state where the cap reads it, posterior alpha against frontal theta, with one reading's scatter
  const W = 580, H = 330, ML = 58, MR = 12, MT = 14, MB = 50;
  const mapBox = document.createElement('div');
  mapBox.className = 'viz-box';
  mapBox.style.flex = `0 0 ${W}px`;
  mapBox.append(vizTitle('Each named state as the cap reads it: posterior alpha against frontal theta'));
  const svg = d3.select(mapBox).append('svg').attr('width', W).attr('height', H).attr('class', 'plot-svg map').style('width', `${W}px`);
  const xs = d3.scaleLog().domain([0.3, 5]).range([ML, W - MR]), ys = d3.scaleLog().domain([0.35, 2.8]).range([H - MB, MT]);
  svg.append('clipPath').attr('id', 'states-map-clip').append('rect').attr('x', ML).attr('y', MT).attr('width', W - ML - MR).attr('height', H - MT - MB);
  const gGrid = svg.append('g').attr('class', 'grid');
  for (const v of [0.5, 1, 2, 4]) gGrid.append('line').attr('x1', xs(v)).attr('x2', xs(v)).attr('y1', MT).attr('y2', H - MB);
  for (const v of [0.5, 1, 2]) gGrid.append('line').attr('x1', ML).attr('x2', W - MR).attr('y1', ys(v)).attr('y2', ys(v));
  const gEll = svg.append('g').attr('clip-path', 'url(#states-map-clip)'), gLabels = svg.append('g'), gPts = svg.append('g');
  const ratio = (v: number) => `×${fmt(v, 2)}`;
  svg.append('g').attr('class', 'axis').attr('transform', `translate(0,${H - MB})`).call(d3.axisBottom(xs).tickValues([0.3, 0.5, 1, 2, 4]).tickFormat((v) => ratio(+v)).tickSize(4));
  svg.append('g').attr('class', 'axis').attr('transform', `translate(${ML},0)`).call(d3.axisLeft(ys).tickValues([0.5, 1, 2]).tickFormat((v) => ratio(+v)).tickSize(4));
  svg.append('text').attr('x', (ML + W - MR) / 2).attr('y', H - 6).attr('text-anchor', 'middle').attr('class', 'axis-label').text('Posterior alpha power the cap reads, relative to eyes-open rest');
  svg.append('text').attr('transform', `translate(14,${(MT + H - MB) / 2}) rotate(-90)`).attr('text-anchor', 'middle').attr('class', 'axis-label').text('Frontal theta power the cap reads');
  const legend = document.createElement('div');
  legend.className = 'glow-legend';
  const rhythmOrder: Rhythm[] = ['slow waves', 'theta', 'alpha', 'mu', 'beta'];
  const areas = [...new Set(SIGNATURES.flatMap((g) => (g ? [g.area] : [])))];
  const changes = [...new Map(SIGNATURES.flatMap((g) => (g ? [[`${g.rhythm}${g.up}`, g] as const] : []))).values()].sort((a, b) => rhythmOrder.indexOf(a.rhythm) - rhythmOrder.indexOf(b.rhythm) || Number(b.up) - Number(a.up));
  legend.innerHTML = `<span>Area of the state’s largest change: ${areas.map((a) => `${sw(AREA_COLOR[a])}${a}`).join(' ')}</span>` +
    `<span>Its rhythm, up or down: ${changes.map((g) => `${tri(RHYTHM_COLOR[g.rhythm], g.up)}${g.rhythm}`).join(' ')}</span>` +
    `<span>${sw(TOLD, 'dash')} one reading’s scatter in these two readings (states closer than its width are confused on them)</span><span class="note">◎ in the largest set told apart; hover a state to see which it is confused with</span>`;
  const tip = document.createElement('div');
  tip.className = 'tooltip';
  tip.style.display = 'none';
  mapBox.style.position = 'relative';
  mapBox.append(tip);
  row.append(mapBox);

  // the counts against electrode count
  const plotBox = document.createElement('div');
  plotBox.className = 'viz-box';
  plotBox.style.flex = '1 1 360px';
  plotBox.append(vizTitle('States told apart and signals resolved, by number of electrodes'));
  const plot = linePlot(plotBox, { x: { label: 'Electrodes within 80° of the vertex', tip: 'Electrodes', scale: 'log', domain: [1, N_MAX] }, y: { label: 'Number', domain: [0, 24] }, height: H - 26, margin: { right: 24 } });
  row.append(plotBox);
  fig.viz.append(legend);

  fig.viz.append(readouts(rApart.el, rAxes.el, rStep.el));
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
    { what: 'Told apart', value: 'Two states are told apart when d′, the separation of their feature means in their mean covariance, reaches 2.56, so that a linear decoder calls nine equally likely readings in ten correctly (Φ(d′/2) = 0.9). The named-state count is the largest set that is pairwise told apart. The map plots two of the eight readings, posterior alpha and frontal theta, as the decoder’s feature means; the ellipse’s half-widths are 2.56 standard deviations of those two features. The count of independent signals takes the box each region’s log power spans across the named states, maps it through the cap at the box’s center, whitens it by the reading’s covariance and counts the principal directions along which the box is at least 2.56 wide, so that one reading tells the extremes of the named states apart along it. A reading resolves 1 + extent/2.56 levels along each direction; the product of those levels is not shown, because it would count every combination of levels as a state and grows without bound with the window.', cite: c('states-model') },
    { what: 'Window range', value: 'The slider runs from 1 to 60 s, with a 2 s default (a model choice) and a mark at the 30 s sleep-scoring epoch; below 1 s the gamma model’s shape would fall under 3.5 in the slowest band.', cite: c('sleep-stages') + c('erd-detect') },
    { what: 'Electrode marks and range', value: 'Four electrodes, as on a consumer headband with four recording sites; 21, the positions of the 10–20 system; 128, a research cap. The slider and the plot run to 100,000 electrodes, as in section 11; above 256 the reading depends only on the cap’s density.', cite: c('consumer-electrodes') + c('eeg-systems') + c('cap-lattice') },
    { what: 'Squares and triangles', value: 'Each state’s square names the area of the largest change in its factors, in log terms, against the rest it is defined from (eyes-open rest, or eyes-closed rest for the states recorded with the eyes closed), and its triangle that change’s rhythm and direction; ties go to the region with the larger resting amplitude. The areas are the posterior alpha region, the frontal regions (slow waves, theta, frontal alpha, beta) and the hand areas (mu). The eyes-open reference state has none. They are read off the state table and add nothing to the model.', cite: c('state-table') + c('rest-amplitudes') },
  ]);

  const settings = (N = sN.value, T = sWin.value): Settings => ({ N: Math.round(N), T, calibration, artifacts: 'present', betweenSd: SPREAD.betweenSd, retest: SPREAD.retest, dStar: D_STAR_90 });
  let acc: Float64Array = new Float64Array(M * M), apart: number[] = [];

  const KA = REGIONS.findIndex((r) => r.id === 'alphaP'), KT = REGIONS.findIndex((r) => r.id === 'theta'), F = REGIONS.length;
  const measure = document.createElement('canvas').getContext('2d')!;
  measure.font = `12px ${getComputedStyle(document.documentElement).getPropertyValue('--sans') || 'system-ui, sans-serif'}`;
  let focusState = 0, drawEllipse = () => {};
  function drawMap(set: Settings) {
    const rest = seen(MODEL, STATES[0], set), views = STATES.map((st) => seen(MODEL, st, set));
    const px = views.map((v) => xs(Math.exp(v.mean[KA] - rest.mean[KA]))), py = views.map((v) => ys(Math.exp(v.mean[KT] - rest.mean[KT])));
    // the told-apart distance around one state: 2.56 standard deviations of its reading each way
    drawEllipse = () => {
      const v = views[focusState], rx = xs(Math.exp(set.dStar * Math.sqrt(v.cov[KA * F + KA]))) - xs(1), ry = ys(1) - ys(Math.exp(set.dStar * Math.sqrt(v.cov[KT * F + KT])));
      gEll.selectAll('*').remove();
      gEll.append('ellipse').attr('cx', px[focusState]).attr('cy', py[focusState]).attr('rx', rx).attr('ry', ry).attr('fill', TOLD).attr('fill-opacity', 0.04).attr('stroke', TOLD).attr('stroke-width', 1.5).attr('stroke-dasharray', '5 4');
    };
    drawEllipse();
    // states the cap reads at the same place share one label
    const groups: number[][] = [];
    STATES.forEach((_, i) => { const g = groups.find((grp) => Math.hypot(px[grp[0]] - px[i], py[grp[0]] - py[i]) < 2.5); if (g) g.push(i); else groups.push([i]); });
    gLabels.selectAll('*').remove();
    gPts.selectAll('*').remove();
    // labels: each takes the nearest free slot around its point, with a pointer when it sits away from it
    const SLOTS: [number, number][] = [];
    for (const dy of [-17, 17, -31, 31, -45, 45, -59, 59, -73, 73, -87, 87, -101, 101, -115, 115]) for (const dx of [0, 24, -24, 48, -48, 72, -72, 96, -96, 120, -120]) SLOTS.push([dx, dy]);
    SLOTS.unshift([10, -9], [10, 9], [-10, -9], [-10, 9]);
    const boxes: { x0: number; y0: number; x1: number; y1: number }[] = groups.map((grp) => ({ x0: px[grp[0]] - 7, y0: py[grp[0]] - 7, x1: px[grp[0]] + 7, y1: py[grp[0]] + 7 }));
    const hit = (b: typeof boxes[0]) => boxes.some((o) => b.x0 < o.x1 + 2 && b.x1 > o.x0 - 2 && b.y0 < o.y1 + 1 && b.y1 > o.y0 - 1);
    const order = groups.map((_, k) => k).sort((a, b) => groups[b].length - groups[a].length || Math.hypot(px[groups[b][0]] - xs(1), py[groups[b][0]] - ys(1)) - Math.hypot(px[groups[a][0]] - xs(1), py[groups[a][0]] - ys(1)));
    for (const k of order) {
      const grp = groups[k], i = grp[0], lines = grp.map((j) => ({ g: SIGNATURES[j], name: STATES[j].name })), LH = 14;
      const tw = Math.max(...lines.map((l) => measure.measureText(l.name).width + (l.g ? 14 : 0))), th = LH * lines.length;
      let chosen: { x: number; y: number; anchor: string; dx: number; dy: number } | null = null;
      for (const [dx, dy] of SLOTS) {
        const anchor = dx > 0 ? 'start' : dx < 0 ? 'end' : 'middle', x = px[i] + dx, y = py[i] + dy * (dy < 0 && lines.length > 1 ? 1 : 1) - (dy < 0 ? th - LH : 0);
        const x0 = anchor === 'start' ? x : anchor === 'end' ? x - tw : x - tw / 2, b = { x0, y0: y - 7, x1: x0 + tw, y1: y - 7 + th };
        if (b.x0 < ML - 4 || b.x1 > W - 2 || b.y0 < 2 || b.y1 > H - MB + 14 || hit(b)) continue;
        chosen = { x, y, anchor, dx, dy }; boxes.push(b); break;
      }
      if (!chosen) chosen = { x: px[i] + 10, y: py[i] - 9, anchor: 'start', dx: 10, dy: -9 };
      const x0 = chosen.anchor === 'start' ? chosen.x : chosen.anchor === 'end' ? chosen.x - tw : chosen.x - tw / 2;
      if (Math.abs(chosen.dx) + Math.abs(chosen.dy) > 20) {
        const ex = Math.max(x0, Math.min(px[i], x0 + tw)), ey = chosen.dy > 0 ? chosen.y - 8 : chosen.y - 7 + th + 1;
        gLabels.append('line').attr('x1', ex).attr('y1', ey).attr('x2', px[i]).attr('y2', py[i]).attr('stroke', '#9a9994').attr('stroke-width', 1);
      }
      lines.forEach((l, n) => {
        const y = chosen!.y + n * LH;
        if (l.g) gLabels.append('path').attr('d', l.g.up ? `M${x0 + 5} ${y - 5} L${x0 + 10} ${y + 4.5} L${x0} ${y + 4.5} Z` : `M${x0} ${y - 4.5} L${x0 + 10} ${y - 4.5} L${x0 + 5} ${y + 5} Z`).attr('fill', RHYTHM_COLOR[l.g.rhythm]);
        gLabels.append('text').attr('x', x0 + (l.g ? 14 : 0)).attr('y', y + 4).attr('class', 'leaf').text(l.name);
      });
    }
    for (const grp of groups) {
      const i = grp[0], g = SIGNATURES[i];
      if (grp.some((j) => apart.includes(j))) gPts.append('circle').attr('cx', px[i]).attr('cy', py[i]).attr('r', 7).attr('fill', 'none').attr('stroke', TOLD).attr('stroke-width', 1.6);
      const dot = gPts.append('circle').datum(i).attr('class', 'state').attr('cx', px[i]).attr('cy', py[i]).attr('r', 4.2).attr('fill', g ? AREA_COLOR[g.area] : '#fbfbfa').attr('stroke', TOLD).attr('stroke-width', 1).style('cursor', 'default');
      dot.on('mousemove', (ev: MouseEvent) => {
        if (focusState !== i) { focusState = i; drawEllipse(); gPts.selectAll<SVGCircleElement, number>('circle.state').attr('stroke-width', (j) => (j !== i && acc[i * M + j] < 0.9 ? 3 : 1)); }
        const others = STATES.map((_, j) => j).filter((j) => !grp.includes(j)).sort((p, q) => acc[i * M + p] - acc[i * M + q]).slice(0, 3);
        tip.style.display = 'block';
        tip.innerHTML = `<b>${grp.map((j) => STATES[j].name).join('; ')}</b>${grp.length > 1 ? ' (read alike)' : ''}, confused most with ${others.map((j) => `${STATES[j].name} (${fmt(100 * acc[i * M + j], 2)}%)`).join(', ')}`;
        const r = mapBox.getBoundingClientRect();
        tip.style.left = `${Math.min(ev.clientX - r.left + 12, W - 280)}px`;
        tip.style.top = `${ev.clientY - r.top + 16}px`;
      }).on('mouseleave', () => { tip.style.display = 'none'; });
    }
  }

  function update() {
    const set = settings(), out = evaluate(MODEL, STATES, set);
    acc = out.acc; apart = out.apart;
    drawMap(set);
    const axes: [number, number][] = [], told: [number, number][] = [];
    for (const N of NS) { const o = evaluate(MODEL, STATES, settings(N)); axes.push([N, o.axes]); told.push([N, Math.max(1, o.apart.length)]); }
    plot.update([
      { name: 'Named states told apart (9 readings in 10)', points: told, color: TOLD, width: 2.5 },
      { name: `Independent signals resolved (of ${REGIONS.length} regions)`, points: axes, color: SIGNALS, width: 2.5 },
    ], [
      { axis: 'y', value: M, label: `${M} named states` },
      { axis: 'y', value: REGIONS.length, label: `${REGIONS.length} regions in the model` },
      { axis: 'x', value: set.N, label: `${fmtN(set.N)} electrodes`, callout: true },
    ]);
    rApart.set(`${out.apart.length} of ${M}`);
    rAxes.set(`${out.axes} of ${REGIONS.length}`);
    const rest = seen(MODEL, STATES[0], set), k = REGIONS.findIndex((r) => r.id === 'alphaP');
    rStep.set(`×${fmt(Math.exp(set.dStar * Math.sqrt(rest.cov[k * REGIONS.length + k])), 2)}`);
  }
  [sN, sWin].forEach((s) => s.onChange(update));
  // the first evaluation runs after the page has painted
  requestAnimationFrame(() => setTimeout(update, 0));
}
