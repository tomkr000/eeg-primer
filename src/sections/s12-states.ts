import * as d3 from 'd3';
import { evaluate, seen, D_STAR_90, BANDS, type Band, type Settings } from '../physics/states';
import { MODEL, STATES, REGIONS, REGION_NAMES, BACKGROUND, EMG, G_SCALE, signature, type Area } from '../data/states';
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
const TOLD = '#1a1a1a', SIGNALS = '#9a9994', SCATTER = '#e4e3df';
/** one hue per area for the dots */
const AREA_COLOR: Record<Area, string> = { posterior: '#d6336c', frontal: '#0b7285', 'hand areas': '#8a6d3b' };
const SIGNATURES = STATES.map(signature);
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
Of the eight readings, only posterior alpha moves any state beyond one reading’s scatter at four electrodes; the
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

  const fig = figure(sec.fig, `Left: one strip per reading. Each of the eight readings is the decoder’s estimate of one region’s band power from the N electrodes (section 11’s estimator, which cancels the other regions as far as the cap resolves them and otherwise mixes them), and every state is a dot at its reading relative to the eyes-open reading ${c('states-model')}. The gray bar is one reading’s scatter, 2.56 standard deviations each way: a state inside it is confused with eyes-open rest on that reading alone; the states outside it are named (short names, the farthest first, the rest counted), and the count under each reading’s name says how many sit inside. A dot’s color is the area of the state’s largest change, read off the state table ${c('state-table')}, so a dot of one color on another area’s strip is a side effect: the strip that defines a label and the strip the cap reads it on need not be the same. The line under the strips names the largest set of states that are pairwise told apart by all eight readings together, at nine readings in ten ${c('states-count')}. Right: that count (${sw(TOLD, 'line')}) and the number of independent signals the cap resolves (${sw(SIGNALS, 'line')}): directions of the eight-region feature space along which one reading tells the named states’ extremes apart, so at most eight, against the number of electrodes at the current window and baseline; the vertical line follows the electrode slider ${c('states-count')}. The electrodes are the first N of a fixed, evenly spread sequence within 80° of the vertex of the section 3 head sphere ${c('cap-lattice')}. Each state’s factors come from the studies cited in the assumptions table ${c('state-table')}; the measured classifier accuracies stay in the text because their caps, windows and labels differ from this model.`, { wide: true });
  const lede = document.createElement('p');
  lede.className = 'figure-lede';
  lede.innerHTML = `<strong>Model of reading named states from one window of EEG.</strong> States that differ by less than one reading’s scatter are confused, whatever the cap ${c('erd-detect')}${c('states-model')}.`;
  fig.el.prepend(lede);

  const row = document.createElement('div');
  row.className = 'viz-row';
  row.style.flexWrap = 'nowrap';
  fig.viz.append(row);

  // the strips: one per reading, each state a dot at its reading relative to eyes-open rest, a bar for one reading's scatter
  const STRIPS: { id: string; name: string }[] = [
    { id: 'alphaP', name: 'Posterior alpha' }, { id: 'theta', name: 'Frontal theta' }, { id: 'slow', name: 'Slow waves' },
    { id: 'muL', name: 'Mu, left hand area' }, { id: 'muR', name: 'Mu, right hand area' }, { id: 'alphaFL', name: 'Frontal alpha, left' },
    { id: 'alphaFR', name: 'Frontal alpha, right' }, { id: 'beta', name: 'Beta' },
  ];
  const W = 580, LC = 136, AX0 = LC + 10, AX1 = W - 12, PITCH = 34, TOP = 28, H = TOP + STRIPS.length * PITCH + 34;
  const stripBox = document.createElement('div');
  stripBox.className = 'viz-box';
  stripBox.style.flex = `0 0 ${W}px`;
  stripBox.append(vizTitle('Each state’s eight readings, relative to eyes-open rest'));
  const svg = d3.select(stripBox).append('svg').attr('width', W).attr('height', H).attr('class', 'plot-svg strips').style('width', `${W}px`);
  const xs = d3.scaleLog().domain([0.1, 30]).range([AX0, AX1]).clamp(true);
  const gStrips = svg.append('g');
  svg.append('g').attr('class', 'axis').attr('transform', `translate(0,${TOP + STRIPS.length * PITCH - 8})`).call(d3.axisBottom(xs).tickValues([0.1, 0.3, 1, 3, 10, 30]).tickFormat((v) => `×${fmt(+v, 1)}`).tickSize(4));
  svg.append('text').attr('x', (AX0 + AX1) / 2).attr('y', H - 4).attr('text-anchor', 'middle').attr('class', 'axis-label').text('Power the cap reads, relative to its eyes-open reading');
  const legend = document.createElement('div');
  legend.className = 'glow-legend';
  const areas = [...new Set(SIGNATURES.flatMap((g) => (g ? [g.area] : [])))];
  legend.innerHTML = `<span>Dot: a state, colored by the area of its largest change: ${areas.map((a) => `${sw(AREA_COLOR[a])}${a}`).join(' ')} <i class="sw-i sw-patch" style="background:#fbfbfa;border:1px solid ${TOLD};border-radius:50%"></i>eyes-open rest</span>` +
    `<span><i class="sw-i sw-patch" style="background:${SCATTER}"></i> one reading’s scatter (2.56 standard deviations): states inside it are confused with rest on that reading; states outside it are named</span>`;
  const toldLine = document.createElement('p');
  toldLine.className = 'strip-told';
  const tip = document.createElement('div');
  tip.className = 'tooltip';
  tip.style.display = 'none';
  stripBox.style.position = 'relative';
  stripBox.append(tip);
  row.append(stripBox);

  // the counts against electrode count
  const plotBox = document.createElement('div');
  plotBox.className = 'viz-box';
  plotBox.style.flex = '1 1 360px';
  plotBox.append(vizTitle('States told apart and signals resolved, by number of electrodes'));
  const plot = linePlot(plotBox, { x: { label: 'Electrodes within 80° of the vertex', tip: 'Electrodes', scale: 'log', domain: [1, N_MAX] }, y: { label: 'Number', domain: [0, 24] }, height: H - 26, margin: { right: 24 } });
  row.append(plotBox);
  fig.viz.append(legend, toldLine);

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
    { what: 'Told apart', value: 'Two states are told apart when d′, the separation of their feature means in their mean covariance, reaches 2.56, so that a linear decoder calls nine equally likely readings in ten correctly (Φ(d′/2) = 0.9). The named-state count is the largest set that is pairwise told apart. The strips plot the eight features’ means relative to the eyes-open state; each bar’s half-width is 2.56 standard deviations of that feature in the eyes-open state, so a state outside the bar is told apart from eyes-open rest by that reading alone. The count of independent signals takes the box each region’s log power spans across the named states, maps it through the cap at the box’s center, whitens it by the reading’s covariance and counts the principal directions along which the box is at least 2.56 wide, so that one reading tells the extremes of the named states apart along it. A reading resolves 1 + extent/2.56 levels along each direction; the product of those levels is not shown, because it would count every combination of levels as a state and grows without bound with the window.', cite: c('states-model') },
    { what: 'Window range', value: 'The slider runs from 1 to 60 s, with a 2 s default (a model choice) and a mark at the 30 s sleep-scoring epoch; below 1 s the gamma model’s shape would fall under 3.5 in the slowest band.', cite: c('sleep-stages') + c('erd-detect') },
    { what: 'Electrode marks and range', value: 'Four electrodes, as on a consumer headband with four recording sites; 21, the positions of the 10–20 system; 128, a research cap. The slider and the plot run to 100,000 electrodes, as in section 11; above 256 the reading depends only on the cap’s density.', cite: c('consumer-electrodes') + c('eeg-systems') + c('cap-lattice') },
    { what: 'Dot colors and short names', value: 'Each dot is colored by the area of the largest change in its state’s factors, in log terms, against the rest it is defined from (eyes-open rest, or eyes-closed rest for the states recorded with the eyes closed); ties go to the region with the larger resting amplitude. The areas are the posterior alpha region, the frontal regions (slow waves, theta, frontal alpha, beta) and the hand areas (mu). The eyes-open reference state is hollow. The names on the strips are short forms of the names in the text (N1, N2, N3 and REM are the sleep stages; Right hand and Left hand the imagined movements).', cite: c('state-table') + c('rest-amplitudes') },
  ]);

  const settings = (N = sN.value, T = sWin.value): Settings => ({ N: Math.round(N), T, calibration, artifacts: 'present', betweenSd: SPREAD.betweenSd, retest: SPREAD.retest, dStar: D_STAR_90 });
  let apart: number[] = [];

  const measure = document.createElement('canvas').getContext('2d')!;
  measure.font = `11.5px ${getComputedStyle(document.documentElement).getPropertyValue('--sans') || 'system-ui, sans-serif'}`;
  function drawStrips(set: Settings) {
    const rest = seen(MODEL, STATES[0], set), views = STATES.map((st) => seen(MODEL, st, set)), F = REGIONS.length;
    gStrips.selectAll('*').remove();
    STRIPS.forEach((strip, s) => {
      const k = REGIONS.findIndex((r) => r.id === strip.id), y0 = TOP + s * PITCH + 20, g = gStrips.append('g');
      const sd = Math.sqrt(rest.cov[k * F + k]), half = set.dStar * sd; // half-width of the bar in log units
      const reading = STATES.map((_, i) => views[i].mean[k] - rest.mean[k]);
      const outside = STATES.map((_, i) => i).filter((i) => Math.abs(reading[i]) >= half).sort((a, b) => Math.abs(reading[b]) - Math.abs(reading[a]));
      g.append('text').attr('x', LC - 6).attr('y', y0 + 1).attr('text-anchor', 'end').attr('class', 'strip-name').text(strip.name);
      g.append('text').attr('x', LC - 6).attr('y', y0 + 13).attr('text-anchor', 'end').attr('class', 'strip-count').text(`${M - outside.length} of ${M} inside the bar`);
      g.append('line').attr('x1', AX0).attr('x2', AX1).attr('y1', y0).attr('y2', y0).attr('stroke', '#d8d7d1');
      g.append('rect').attr('x', xs(Math.exp(-half))).attr('y', y0 - 6).attr('width', xs(Math.exp(half)) - xs(Math.exp(-half))).attr('height', 12).attr('fill', SCATTER);
      g.append('line').attr('x1', xs(1)).attr('x2', xs(1)).attr('y1', y0 - 8).attr('y2', y0 + 8).attr('stroke', TOLD);
      // short names above the dots for the states outside the bar, the farthest first, in one row; the rest are counted at its end
      const place = (reserve: number) => {
        const boxes: { x0: number; x1: number; i: number; cx: number }[] = [];
        let unnamed = 0;
        for (const i of outside) {
          const tw = measure.measureText(STATES[i].short).width, px = xs(Math.exp(reading[i])), lo = AX0 + tw / 2, hi = AX1 - reserve - tw / 2;
          // slide the name sideways, by up to 70 px, to the nearest spot clear of the names already placed
          let found: { x0: number; x1: number; i: number; cx: number } | null = null;
          for (let d = 0; d <= 70 && !found; d += 4) for (const cx of d ? [px - d, px + d] : [px]) {
            if (cx < lo || cx > hi) continue;
            const box = { x0: cx - tw / 2 - 3, x1: cx + tw / 2 + 3, i, cx };
            if (!boxes.some((o) => box.x0 < o.x1 && box.x1 > o.x0)) { found = box; break; }
          }
          if (found) boxes.push(found); else unnamed++;
        }
        return { boxes, unnamed };
      };
      let { boxes, unnamed } = place(0);
      if (unnamed) ({ boxes, unnamed } = place(68));
      for (const b of boxes) {
        const px = xs(Math.exp(reading[b.i])), ty = y0 - 11;
        if (Math.abs(b.cx - px) > 4) g.append('line').attr('x1', b.cx).attr('y1', ty + 2).attr('x2', px).attr('y2', y0 - 5).attr('stroke', '#9a9994');
        g.append('text').attr('x', b.cx).attr('y', ty).attr('text-anchor', 'middle').attr('class', 'leaf').text(STATES[b.i].short);
      }
      if (unnamed) g.append('text').attr('x', AX1).attr('y', y0 - 11).attr('text-anchor', 'end').attr('class', 'strip-count').text(`and ${unnamed} more`);
      STATES.forEach((st, i) => {
        const sig = SIGNATURES[i];
        g.append('circle').attr('cx', xs(Math.exp(reading[i]))).attr('cy', y0).attr('r', 4).attr('fill', sig ? AREA_COLOR[sig.area] : '#fbfbfa').attr('stroke', TOLD).attr('stroke-width', 1).style('cursor', 'default')
          .on('mousemove', (ev: MouseEvent) => {
            tip.style.display = 'block';
            tip.innerHTML = `<b>${st.name}</b>: ${strip.name.toLowerCase()} ×${fmt(Math.exp(reading[i]), 2)} the eyes-open reading, d′ ${fmt(Math.abs(reading[i]) / sd, 2)} from rest on this reading alone`;
            const rc = stripBox.getBoundingClientRect();
            tip.style.left = `${Math.min(ev.clientX - rc.left + 12, W - 280)}px`;
            tip.style.top = `${ev.clientY - rc.top + 16}px`;
          }).on('mouseleave', () => { tip.style.display = 'none'; });
      });
    });
  }

  function update() {
    const set = settings(), out = evaluate(MODEL, STATES, set);
    apart = out.apart;
    drawStrips(set);
    toldLine.innerHTML = `<b>Told apart by all eight readings together</b> (every pair at 9 readings in 10): ${apart.map((i) => STATES[i].short).join(', ')}.`;
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
