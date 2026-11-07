import * as d3 from 'd3';
import { evaluate, seen, dendrogram, D_STAR_90, BANDS, type Band, type Settings } from '../physics/states';
import { MODEL, STATES, REGIONS, REGION_NAMES, BACKGROUND, EMG, G_SCALE, signature, type Area, type Rhythm } from '../data/states';
import { controls, readout, slider, choice, fmt } from '../ui/slider';
import { linePlot } from '../ui/plot';
import { claimCite as c } from '../data/params';
import { section, figure, prose, readouts, assumptions, sw, vizTitle } from '../ui/layout';

const M = STATES.length;
const DEFAULTS = { N: 128, T: 2 };
/** spread of resting log power between people and its day-to-day reliability per band (claims between-person, test-retest) */
const SPREAD = { betweenSd: 0.65, retest: { slow: 0.66, theta: 0.77, alpha: 0.88, beta: 0.81 } as Record<Band, number> };
/** electrode counts for the curves, log-spaced from 1 to 100,000 */
const N_MAX = 100000;
const NS = Array.from(new Set(Array.from({ length: 41 }, (_, i) => Math.round(Math.pow(N_MAX, i / 40)))));
const fmtN = (n: number) => Math.round(n).toLocaleString('en-US');
/** told apart (the count and the line) and the signals the cap resolves */
const TOLD = '#1a1a1a', SIGNALS = '#9a9994';
/** the rhythm hues of section 6 for the triangles, and one hue per area for the squares */
const RHYTHM_COLOR: Record<Rhythm, string> = { 'slow waves': '#6250d6', theta: '#1baf7a', alpha: '#2a78d6', mu: '#eb6834', beta: '#898781' };
const AREA_COLOR: Record<Area, string> = { posterior: '#d6336c', frontal: '#0b7285', 'hand areas': '#8a6d3b' };
const SIGNATURES = STATES.map(signature);
const RHYTHM_ORDER: Rhythm[] = ['slow waves', 'theta', 'alpha', 'mu', 'beta'], AREA_ORDER: Area[] = ['posterior', 'frontal', 'hand areas'];
/** sort key of a state's signature: rhythm, then up before down, then area, then the table; the reference state first */
const sigKey = (i: number) => { const g = SIGNATURES[i]; return g ? 1000 * (1 + RHYTHM_ORDER.indexOf(g.rhythm)) + 100 * (g.up ? 0 : 1) + 10 * AREA_ORDER.indexOf(g.area) + i / 100 : 0; };
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
<p>With the defaults (a 128-electrode research cap, a 2 s window, a same-session baseline) the model tells apart
7 of the ${M} named states: eyes open, eyes closed, the two hand movements, light sleep (N2), deep sleep and anesthesia.
Thirteen waking states, from focus and workload to the moods and the sleep-onset stages, form one group that a reading
cannot split, and the eyes-closed states another ${c('states-count')}. A four-electrode headband leaves only three
states pairwise distinct: eyes closed, high workload and deep sleep. Of the eight readings, only posterior alpha moves any state beyond one reading’s scatter at four electrodes; the
frontal theta reading, on which five of the labels rest, changes by at most 1.4% across the twenty states there, and
by 19% for high workload even with 100,000 electrodes, against a scatter of ×2.5 per 2 s reading ${c('states-count')}.
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

  const fig = figure(sec.fig, `Left: the named states grouped by the separation d′ of their feature means in their reading-to-reading covariance, from which a linear decoder on the eight log band powers calls a share Φ(d′/2) of single readings correctly, both states equally likely ${c('states-model')}. Groups join at the mean d′ over their pairs (average linkage). Joins left of the ${sw(TOLD, 'dash')} line, where d′ is below 2.56 and the decoder calls fewer than nine readings in ten correctly, are not drawn: the states they connect form one bracket, placed at the separation where its last member joined, and its members are listed by rhythm and area so that what the cap lumps together can be read against what defines each state. Joins right of the line are drawn at their separation. A dot marks the largest set of states that are pairwise told apart in nine readings of ten, which can include members of one bracket, because a bracket is confused on average. Beside each state, a square names the area of its largest change and a triangle that change’s rhythm and direction, read off the state table ${c('state-table')}. Right: that count (${sw(TOLD, 'line')}) and the number of independent signals the cap resolves (${sw(SIGNALS, 'line')}): directions of the eight-region feature space along which one reading tells the named states’ extremes apart, so at most eight, against the number of electrodes at the current window and baseline; the vertical line follows the electrode slider ${c('states-count')}. The electrodes are the first N of a fixed, evenly spread sequence within 80° of the vertex of the section 3 head sphere ${c('cap-lattice')}. Each state’s factors come from the studies cited in the assumptions table ${c('state-table')}; the measured classifier accuracies stay in the text because their caps, windows and labels differ from this model.`, { wide: true });
  const lede = document.createElement('p');
  lede.className = 'figure-lede';
  lede.innerHTML = `<strong>Model of reading named states from one window of EEG.</strong> States that differ by less than one reading’s scatter are confused, whatever the cap ${c('erd-detect')}${c('states-model')}.`;
  fig.el.prepend(lede);

  const row = document.createElement('div');
  row.className = 'viz-row';
  row.style.flexWrap = 'nowrap';
  fig.viz.append(row);

  // the tree of confusions, cut at the told-apart line: states that join left of it form one bracket, the branches
  // right of it show how the brackets separate
  const CELL = 14, LW = 214, TOP = 22, BOTTOM = 42, TW = 290, PAD = 6;
  const W = LW + TW + PAD, H = TOP + M * CELL + BOTTOM;
  const treeBox = document.createElement('div');
  treeBox.className = 'viz-box';
  treeBox.style.flex = `0 0 ${W}px`;
  treeBox.append(vizTitle('Named states grouped by how well one reading tells them apart'));
  const svg = d3.select(treeBox).append('svg').attr('width', W).attr('height', H).attr('class', 'plot-svg tree').style('width', `${W}px`);
  const xs = d3.scaleLog().domain([0.5, 60]).range([LW + 6, LW + TW]).clamp(true);
  const ys = (i: number) => TOP + i * CELL + CELL / 2;
  const gBands = svg.append('g'), gTree = svg.append('g').attr('fill', 'none').attr('stroke', '#4a4a46').attr('stroke-width', 1.5), gLeaves = svg.append('g');
  const xTold = xs(D_STAR_90);
  svg.append('line').attr('x1', xTold).attr('x2', xTold).attr('y1', TOP - 2).attr('y2', TOP + M * CELL + 2).attr('stroke', TOLD).attr('stroke-width', 1.5).attr('stroke-dasharray', '5 4');
  svg.append('text').attr('x', xTold - 5).attr('y', TOP - 7).attr('text-anchor', 'end').attr('class', 'marker-label').attr('fill', '#4a4a46').text('confused');
  svg.append('text').attr('x', xTold + 5).attr('y', TOP - 7).attr('text-anchor', 'start').attr('class', 'marker-label').attr('fill', TOLD).attr('font-weight', 600).text('told apart');
  const axis = d3.axisBottom(xs).tickValues([0.5, 1, 3, 10, 30]).tickFormat((v) => fmt(+v, 1)).tickSize(4);
  svg.append('g').attr('class', 'axis').attr('transform', `translate(0,${TOP + M * CELL + 4})`).call(axis);
  svg.append('text').attr('x', xs.range()[1]).attr('y', H - 4).attr('text-anchor', 'end').attr('class', 'axis-label').text('Separation d′ between the groups in one reading');
  const legend = document.createElement('div');
  legend.className = 'glow-legend';
  const areas = [...new Set(SIGNATURES.flatMap((g) => (g ? [g.area] : [])))];
  const changes = [...new Map(SIGNATURES.flatMap((g) => (g ? [[`${g.rhythm}${g.up}`, g] as const] : []))).values()].sort((a, b) => RHYTHM_ORDER.indexOf(a.rhythm) - RHYTHM_ORDER.indexOf(b.rhythm) || Number(b.up) - Number(a.up));
  legend.innerHTML = `<span>Area of the state’s largest change: ${areas.map((a) => `${sw(AREA_COLOR[a])}${a}`).join(' ')}</span>` +
    `<span>Its rhythm, up or down: ${changes.map((g) => `${tri(RHYTHM_COLOR[g.rhythm], g.up)}${g.rhythm}`).join(' ')}</span>` +
    `<span>Bracket: states one reading confuses, on average (joined left of the ${sw(TOLD, 'dash')} line); brackets join at their average separation</span><span class="note">● in the largest set told apart</span>`;
  const tip = document.createElement('div');
  tip.className = 'tooltip';
  tip.style.display = 'none';
  treeBox.style.position = 'relative';
  treeBox.append(tip);
  row.append(treeBox);

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
    { what: 'Told apart', value: 'Two states are told apart when d′, the separation of their feature means in their mean covariance, reaches 2.56, so that a linear decoder calls nine equally likely readings in ten correctly (Φ(d′/2) = 0.9). The named-state count is the largest set that is pairwise told apart. The tree joins two groups at the mean d′ over their pairs (average linkage), collapses every join below 2.56 into a bracket, and orders the brackets so that the one holding the earliest state of the table comes first; it displays the pairwise separations and adds no model. The count of independent signals takes the box each region’s log power spans across the named states, maps it through the cap at the box’s center, whitens it by the reading’s covariance and counts the principal directions along which the box is at least 2.56 wide, so that one reading tells the extremes of the named states apart along it. A reading resolves 1 + extent/2.56 levels along each direction; the product of those levels is not shown, because it would count every combination of levels as a state and grows without bound with the window.', cite: c('states-model') },
    { what: 'Window range', value: 'The slider runs from 1 to 60 s, with a 2 s default (a model choice) and a mark at the 30 s sleep-scoring epoch; below 1 s the gamma model’s shape would fall under 3.5 in the slowest band.', cite: c('sleep-stages') + c('erd-detect') },
    { what: 'Electrode marks and range', value: 'Four electrodes, as on a consumer headband with four recording sites; 21, the positions of the 10–20 system; 128, a research cap, the default so that the figure opens where the cap resolves most of the regions. The slider and the plot run to 100,000 electrodes, as in section 11; above 256 the reading depends only on the cap’s density.', cite: c('consumer-electrodes') + c('eeg-systems') + c('cap-lattice') },
    { what: 'Squares and triangles', value: 'Each state’s square names the area of the largest change in its factors, in log terms, against the rest it is defined from (eyes-open rest, or eyes-closed rest for the states recorded with the eyes closed), and its triangle that change’s rhythm and direction; ties go to the region with the larger resting amplitude. The areas are the posterior alpha region, the frontal regions (slow waves, theta, frontal alpha, beta) and the hand areas (mu). The eyes-open reference state has none. Within a bracket the states are listed by rhythm (slow waves, theta, alpha, mu), up before down, then by area. The marks are read off the state table and add nothing to the model.', cite: c('state-table') + c('rest-amplitudes') },
  ]);

  const settings = (N = sN.value, T = sWin.value): Settings => ({ N: Math.round(N), T, calibration, artifacts: 'present', betweenSd: SPREAD.betweenSd, retest: SPREAD.retest, dStar: D_STAR_90 });
  let acc: Float64Array = new Float64Array(M * M), dMat: Float64Array = new Float64Array(M * M), apart: number[] = [];

  function drawTree() {
    const joins = dendrogram(M, dMat, 'average'), N2 = 2 * M - 1, node = (n: number) => (n < M ? null : joins[n - M]);
    const height = (n: number) => (n < M ? 0 : joins[n - M].h), parent = new Int32Array(N2).fill(-1);
    joins.forEach((j, k) => { parent[j.a] = M + k; parent[j.b] = M + k; });
    // every leaf climbs to the highest join below the told-apart line: that node is its bracket
    const root = (n: number) => { while (parent[n] >= 0 && height(parent[n]) < D_STAR_90) n = parent[n]; return n; };
    const bracketOf = Array.from({ length: M }, (_, i) => root(i));
    // leaf order from the whole tree, the group holding the earliest state of the table on top; then each bracket's
    // members are sorted by their signature so the colors read as blocks
    const rank = (n: number): number => (n < M ? n : Math.min(rank(node(n)!.a), rank(node(n)!.b)));
    const order: number[] = [];
    const walk = (n: number) => { const j = node(n); if (!j) { order.push(n); return; } const [top, bottom] = rank(j.a) <= rank(j.b) ? [j.a, j.b] : [j.b, j.a]; walk(top); walk(bottom); };
    walk(N2 - 1);
    const brackets = [...new Set(order.map((i) => bracketOf[i]))].map((b) => ({ b, members: order.filter((i) => bracketOf[i] === b).sort((p, q) => sigKey(p) - sigKey(q)) }));
    const rowOf = new Int32Array(M);
    let r = 0;
    for (const br of brackets) for (const i of br.members) rowOf[i] = r++;
    // positions of the drawn nodes: a bracket at its own formation height, joins above the line at theirs
    const x = new Float64Array(N2), y = new Float64Array(N2);
    gBands.selectAll('*').remove();
    gTree.selectAll('*').remove();
    brackets.forEach((br, k) => {
      const rows = br.members.map((i) => rowOf[i]), y0 = ys(Math.min(...rows)) - CELL / 2, y1 = ys(Math.max(...rows)) + CELL / 2;
      if (k % 2) gBands.append('rect').attr('x', 4).attr('y', y0).attr('width', W - 8).attr('height', y1 - y0).attr('fill', '#f1f0ec');
      const xb = xs(Math.max(height(br.b), xs.domain()[0]));
      x[br.b] = xb; y[br.b] = (ys(Math.min(...rows)) + ys(Math.max(...rows))) / 2;
      for (const i of br.members) gTree.append('line').attr('x1', xs.range()[0]).attr('x2', xb).attr('y1', ys(rowOf[i])).attr('y2', ys(rowOf[i]));
      if (br.members.length > 1) gTree.append('line').attr('x1', xb).attr('x2', xb).attr('y1', ys(Math.min(...rows))).attr('y2', ys(Math.max(...rows)));
    });
    joins.forEach((j, k) => {
      if (j.h < D_STAR_90) return;
      const n = M + k;
      x[n] = xs(j.h); y[n] = (y[j.a] + y[j.b]) / 2;
      for (const ch of [j.a, j.b]) gTree.append('line').attr('x1', x[ch]).attr('x2', x[n]).attr('y1', y[ch]).attr('y2', y[ch]);
      gTree.append('line').attr('x1', x[n]).attr('x2', x[n]).attr('y1', y[j.a]).attr('y2', y[j.b]);
    });
    gLeaves.selectAll('*').remove();
    STATES.forEach((st, i) => {
      const cy = ys(rowOf[i]), g = SIGNATURES[i];
      if (g) {
        gLeaves.append('rect').attr('x', LW - 28).attr('y', cy - 4.5).attr('width', 9).attr('height', 9).attr('rx', 1).attr('fill', AREA_COLOR[g.area]);
        gLeaves.append('path').attr('d', g.up ? `M${LW - 11} ${cy - 5} L${LW - 6} ${cy + 4.5} L${LW - 16} ${cy + 4.5} Z` : `M${LW - 16} ${cy - 4.5} L${LW - 6} ${cy - 4.5} L${LW - 11} ${cy + 5} Z`).attr('fill', RHYTHM_COLOR[g.rhythm]);
      }
      gLeaves.append('text').attr('x', LW - 34).attr('y', cy + 4).attr('text-anchor', 'end').attr('class', 'leaf').text(st.name)
        .on('mousemove', (ev: MouseEvent) => {
          const others = STATES.map((_, j) => j).filter((j) => j !== i).sort((p, q) => acc[i * M + p] - acc[i * M + q]).slice(0, 3);
          tip.style.display = 'block';
          tip.innerHTML = `<b>${st.name}</b>, confused most with ${others.map((j) => `${STATES[j].name} (${fmt(100 * acc[i * M + j], 2)}%)`).join(', ')}`;
          const rc = treeBox.getBoundingClientRect();
          tip.style.left = `${Math.min(ev.clientX - rc.left + 12, W - 280)}px`;
          tip.style.top = `${ev.clientY - rc.top + 16}px`;
        })
        .on('mouseleave', () => { tip.style.display = 'none'; });
      if (apart.includes(i)) gLeaves.append('circle').attr('cx', xs.range()[0]).attr('cy', cy).attr('r', 2.8).attr('fill', TOLD);
    });
  }

  function update() {
    const set = settings(), out = evaluate(MODEL, STATES, set);
    acc = out.acc; dMat = out.d; apart = out.apart;
    drawTree();
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
