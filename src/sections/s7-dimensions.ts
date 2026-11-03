import * as d3 from 'd3';
import { gammaSample, classifyWindows, wolpawBits, snrVersusElectrodes, gammaP } from '../physics/control';
import { mulberry32 } from '../physics/population';
import { controls, readout, slider, choice, fmt } from '../ui/slider';
import { P, claimCite as c } from '../data/params';
import { section, figure, prose, readouts, assumptions, sw, vizTitle } from '../ui/layout';
import { sourceSliders, momentNam } from './s5-noise';
import { MOTOR } from './dim-model';
import { headGeometry, titledCanvas, footnote, drawCortex } from './head-view';

/** the decoder's channel: the best linear combination of a 64-electrode cap (the model of section 9) */
const CAP = { electrodes: 64, noiseUv: 1, bgUv: 10, radiusMm: 10 };
const [cap] = snrVersusElectrodes([CAP.electrodes], CAP.noiseUv, CAP.bgUv, CAP.radiusMm);
/** rhythm power over the in-band noise power in that channel */
const rhoOf = (N: number, f: number) => (momentNam(N, f) * cap.withBrain) ** 2;

/** Measured change of mu power at the three central electrodes during four imagined movements (claim mi-matrix), per cent of rest. */
const ELECTRODES = ['C3', 'Cz', 'C4'] as const;
const COLOURS = ['#2a78d6', '#1baf7a', '#eb6834'];
const MOVES = [
  { name: 'Left hand', erd: [-64.6, -56.8, -86.7], sd: [25.2, 14.7, 9.4] },
  { name: 'Right hand', erd: [-84.7, -58.3, -71.6], sd: [16.8, 18.4, 18.8] },
  { name: 'Feet', erd: [89.3, -21.3, 112.7], sd: [116.8, 65.1, 140.8] },
  { name: 'Tongue', erd: [145.2, 107.0, 133.6], sd: [128.9, 66.8, 160.5] },
];
const MC = 600; // random windows per movement behind the readouts
/** mean power during the movement relative to rest, as the channel sees it: the rhythm's change plus the unchanging noise floor */
const seen = (erdPct: number, n: number) => (1 + erdPct / 100 + n) / (1 + n);

export function mountDimensions(root: HTMLElement) {
  const sec = section(root, 'dimensions', '7', 'A head with EEG can operate only a few dimensions', 'Few rhythms can be changed at will, their changes overlap, and each hides in the rhythm’s own fluctuation');
  prose(sec.text, `
<p>A dimension of control is a signal a person can move at will, independently of the others. With EEG the
signals are the sensorimotor rhythms (the mu rhythm and its 20 Hz partner; the aside after section 4 maps the
scalp's rhythms), and the way to move one is to imagine a movement: the mu rhythm over that body part's area
loses part of its power (event-related desynchronization, ERD), about half of it on
average in one study and about 85% in the most reactive band in another, both averaged over many trials
${c('erd-depth')}. The body parts with areas large enough and far enough apart to show up from outside are
few: the two hands, the feet and the tongue, the four classes of the imagery competitions
${c('mi-classes')}. The figure shows what each of the four does to the three central electrodes, measured in
nine people ${c('mi-matrix')}. The four responses are not four independent signals. Imagining either hand
dims the rhythm under both hand electrodes, C3 and C4, and the two hands differ only in which side dims
more; imagining the feet or the tongue does not dim the hand electrodes but brightens them, and the two
differ mainly at the midline electrode Cz ${c('mi-overlap')}. Three electrodes and four coupled responses
leave about three contrasts to read: hands against the rest, left against right, and the midline up or
down. That is the ceiling the record reflects: three dimensions controlled at will ${c('dof-control')}, and
a three-task limit found when tasks were added one by one ${c('task-limit')}.</p>
<p>Each contrast is then read through the rhythm's own fluctuation. A rhythm is not a steady sine: the power
measured over a window of T seconds in a band B hertz wide scatters by about 1/√(BT) of its mean from one
window to the next, ±58% for a 3 Hz band over 1 s, however strong the rhythm ${c('erd-detect')}, and real
alpha power scatters two to three times more than that ${c('rhythm-fluctuation')}. The bands in the figure
are that scatter, and the dots are one window's reading; press the button to draw another and watch the
left-hand row turn into the right-hand row. Longer windows narrow the bands as √T but cost time (section 8);
measured accuracy for left- versus right-hand imagery climbs the same way, from about 65% with 1 s windows to
74% with 4 s ${c('window-accuracy')}. The four-way choice carries about 0.15 bits/s at best
${c('mi-bitrate')}; the best interfaces of 2002 managed 10 to 25 bits per minute ${c('itr-2002')}; attempts
to read limb trajectories from EEG did not beat chance ${c('kinematics-chance')}; and control fails
altogether for an estimated 15 to 30% of users ${c('bci-inefficiency')}. The fastest EEG spellers reach
about 5 bits/s only by decoding responses to flickering targets chosen by gaze, a selection rather than a
dimension of control ${c('itr-ssvep')}. Intracortical arrays, for comparison, decode handwriting at
90 characters/min and speech at 62 words/min ${c('intracortical')}.</p>`);

  const { sN, sF } = sourceSliders();
  const sWin = slider({ label: 'Window for one decision', unit: 's', min: 0.5, max: 4, step: 0.05, value: 1, marks: [{ value: 1, label: 'Typical' }, { value: 4, label: 'Competition' }], note: c('bci-windows') });
  let move = 1;
  const pick = choice('Imagined movement', MOVES.map((m, i) => ({ value: String(i), label: m.name })), '1', (v) => { move = Number(v); update(false); });
  const again = document.createElement('button');
  again.className = 'btn'; again.textContent = 'Draw another window';
  const rLR = readout('Left or right hand: one window called right', c('erd-detect'));
  const rFT = readout('Feet or tongue: one window called right', c('erd-detect'));
  const rFour = readout('Which of the four: called right (chance 25%)', c('mi-bitrate'));
  const rRecord = readout('The record: dimensions controlled at will', c('dof-control'));

  const fig = figure(sec.fig, `Left: the head from above with the motor areas of section 4 and the three central electrodes of the 10–20 system, C3 over the left hemisphere's hand area (which moves the right hand), Cz on the midline and C4 over the right hemisphere's. The discs show the mu power at each electrode in one window during the chosen imagined movement, relative to rest. Right: the measured mean change of mu power at those electrodes for each of the four imagined movements (${sw(COLOURS[0], 'patch')} C3, ${sw(COLOURS[1], 'patch')} Cz, ${sw(COLOURS[2], 'patch')} C4), each as a tick, with the band that one window's estimate scatters over at the chosen window length and a dot for one such window ${c('mi-matrix')}${c('erd-detect')}; the shaded region lies below the channel's noise floor, the mean reading with the rhythm gone entirely. The readouts are the shares of windows a decoder reading the three electrodes calls right, from ${MC} random windows per movement; the measured four-class figure is 68% with 4 s windows and many more electrodes ${c('mi-bitrate')}.`, { wide: true });
  const row = document.createElement('div');
  row.className = 'viz-row';
  row.style.flexWrap = 'nowrap';
  fig.viz.append(row);
  const HW = 300, HH = 282, FOOT = 46;
  const headBox = document.createElement('div');
  headBox.style.flex = `0 0 ${HW}px`;
  const head = titledCanvas(headBox, 'Where the electrodes sit', HW, HH + FOOT);
  const hctx = head.getContext('2d')!;
  const geo = headGeometry(HW, HH);
  const plotBox = document.createElement('div');
  plotBox.className = 'viz-box'; plotBox.style.flex = '1 1 400px';
  plotBox.append(vizTitle('Mu power at the three electrodes during each imagined movement, relative to rest'));
  const svg = d3.select(plotBox).append('svg').attr('class', 'plot-svg').attr('height', HH + FOOT);
  row.append(headBox, plotBox);
  const verdict = readouts(rLR.el, rFT.el, rFour.el, rRecord.el);
  verdict.style.gridTemplateColumns = 'repeat(4, 1fr)';
  fig.viz.append(verdict);
  again.style.alignSelf = 'start';
  fig.panel.append(controls(pick.el, sWin.el, sN.el, sF.el, again));
  assumptions(fig.el, [
    { what: 'Responses', value: 'the mean change of mu power at C3, Cz and C4 during imagined movements of the left hand, right hand, feet and tongue in nine people (trial-averaged, in the most reactive band of each person, electrode and task, from Laplacian derivations on a dense grid rather than bare electrodes, so upper bounds for a fixed-band decoder on three plain electrodes); the two hand responses are also what section 4 shows from the lead field: each hand area is seen by both hand electrodes', cite: c('mi-matrix') + c('mi-overlap') },
    { what: 'Channel', value: `the rhythm is the patch of the N and synchrony sliders through the best linear combination of ${CAP.electrodes} electrodes for a ${CAP.radiusMm} mm patch, against the brain's background (${CAP.bgUv} µV per electrode) and ${CAP.noiseUv} µV of electrode noise (section 9); the unchanging noise adds a floor of 1/ρ to every reading, with ρ the rhythm's power over the noise`, cite: c('snr-electrodes') + c('brain-background') },
    { what: 'One window', value: 'the power estimate over B·T degrees of freedom is gamma distributed with a spread of 1/√(BT) of its mean (B = 3 Hz); the band drawn is the 16th to 84th percentile; the dots are one random draw per electrode, the same draws on the head', cite: c('erd-detect') + c('window-samples') },
    { what: 'Decoder', value: `reads the three electrodes of one window, taken as independent, and picks the movement whose measured response makes the reading most likely (the gamma likelihood); the shares are from ${MC} windows per movement. Real decoders use more electrodes and learned spatial filters, which is why the measured four-class figure, 68% with 4 s windows, beats this one`, cite: c('mi-bitrate') + c('window-accuracy') },
    { what: 'Electrodes on the head', value: 'C3 and C4 are drawn above the hand areas of section 4 and Cz on the midline above the foot area; the 10–20 positions lie approximately there', cite: c('mi-matrix') },
  ]);

  // head view: the five patches of section 4 and three electrode discs above the hand areas and the midline
  const patches = MOTOR();
  const above = (i: number) => { const [x, y] = geo.srcXY[patches[i].center]; return [x, y] as [number, number]; };
  const elXY: [number, number][] = [above(0), [(above(0)[0] + above(1)[0]) / 2, above(2)[1]], above(1)];
  const shade = (p: number) => { const t = Math.max(0, Math.min(1, (Math.log2(p) + 2) / 4)); return d3.interpolateRgb('#ffffff', '#1a1a1a')(0.08 + 0.84 * t); }; // ×0.25 light, ×1 mid, ×4 dark
  function drawHead(sample: number[]) {
    hctx.clearRect(0, 0, HW, HH + FOOT);
    drawCortex(hctx, geo, patches);
    ELECTRODES.forEach((name, e) => {
      const [x, y] = elXY[e];
      hctx.beginPath(); hctx.arc(x, y, 16, 0, 2 * Math.PI);
      hctx.fillStyle = shade(sample[e]); hctx.fill();
      hctx.lineWidth = 3; hctx.strokeStyle = COLOURS[e]; hctx.stroke();
      hctx.font = 'bold 12px system-ui, sans-serif'; hctx.textAlign = 'center';
      hctx.fillStyle = sample[e] > 0.9 ? '#fff' : '#1a1a1a'; hctx.fillText(`×${fmt(sample[e], 2)}`, x, y + 4);
      hctx.fillStyle = '#1a1a1a'; hctx.font = 'bold 13px system-ui, sans-serif'; hctx.fillText(name, x, y + 31);
    });
    footnote(hctx, HH, [[`imagining the ${MOVES[move].name.toLowerCase()}: mu power in one window`], [{ sw: shade(0.25) }, '×0.25 (dim)   ', { sw: shade(1) }, '×1 (rest)   ', { sw: shade(4) }, '×4 (bright)'], ['patches 1 to 5: the motor areas of section 4']]);
  }

  let seed = 1;
  function update(newDraw = true) {
    if (newDraw) seed++;
    const T = sWin.value, k = P.decoderBandHz * T, n = 1 / rhoOf(sN.value, sF.value), floor = n / (1 + n);
    const means = MOVES.map((m) => m.erd.map((v) => seen(v, n)));
    const rng = mulberry32(seed);
    const draws = means.map((row) => row.map((mu) => gammaSample(k, mu / k, rng)));
    drawHead(draws[move]);
    drawPlot(means, draws, k, floor);
    const acc = (idx: number[]) => classifyWindows(idx.map((i) => means[i]), k, MC, 7).overall;
    const lr = acc([0, 1]), ft = acc([2, 3]), four = acc([0, 1, 2, 3]);
    rLR.set(`${Math.round(100 * lr)}%`);
    rFT.set(`${Math.round(100 * ft)}%`);
    rFour.set(`${Math.round(100 * four)}% <span class="readout-aside">${fmt(wolpawBits(four, 4) / T, 2)} bits/s</span>`);
    rRecord.set('3');
  }

  /** the dot plot: twelve rows, the band of one window's scatter, the measured mean and one draw */
  function drawPlot(means: number[][], draws: number[][], k: number, floor: number) {
    const W = Math.max(520, plotBox.clientWidth || 0), H = HH + FOOT, ml = 118, mr = 210, mt = 26, mb = 36;
    svg.attr('width', W).attr('viewBox', `0 0 ${W} ${H}`);
    svg.selectAll('*').remove();
    const x = d3.scaleLog().domain([0.06, 8]).range([ml, W - mr]);
    const rowH = (H - mt - mb) / 12, y = (g: number, e: number) => mt + (g * 3 + e + 0.5) * rowH;
    // the noise floor, the rest line and the axis
    svg.append('rect').attr('x', x(0.06)).attr('y', mt).attr('width', x(floor) - x(0.06)).attr('height', H - mt - mb).attr('fill', '#1a1a1a').attr('opacity', 0.08);
    const floorLeft = floor > 0.55; // when the floor nears the rest line, label it from the left edge instead
    svg.append('text').attr('class', 'marker-label').attr('x', floorLeft ? x(0.06) + 4 : x(floor) - 4).attr('y', mt - 8).attr('text-anchor', floorLeft ? 'start' : 'end').text('noise floor');
    svg.append('line').attr('x1', x(1)).attr('x2', x(1)).attr('y1', mt).attr('y2', H - mb).attr('stroke', '#52514e').attr('stroke-dasharray', '4 3');
    svg.append('text').attr('class', 'marker-label').attr('x', x(1) + 4).attr('y', mt - 8).text('rest');
    const axis = d3.axisBottom(x).tickValues([0.1, 0.25, 0.5, 1, 2, 4]).tickFormat((v) => `×${v}`);
    svg.append('g').attr('class', 'axis').attr('transform', `translate(0,${H - mb})`).call(axis as never);
    svg.append('text').attr('class', 'axis-label').attr('x', (ml + W - mr) / 2).attr('y', H - 4).attr('text-anchor', 'middle').text('mu power in one window, relative to rest');
    // the selected movement's rows, highlighted
    svg.append('rect').attr('x', 4).attr('y', mt + move * 3 * rowH).attr('width', W - mr - 4).attr('height', 3 * rowH).attr('fill', '#2a78d6').attr('opacity', 0.07).attr('rx', 4);
    MOVES.forEach((m, g) => {
      svg.append('text').attr('x', 8).attr('y', y(g, 1) + 4).attr('font-size', 13).attr('font-weight', 600).attr('fill', '#1a1a1a').text(m.name);
      ELECTRODES.forEach((name, e) => {
        const yy = y(g, e), mu = means[g][e], q = (p: number) => gammaQuantile(k, mu / k, p);
        svg.append('text').attr('x', ml - 8).attr('y', yy + 4).attr('text-anchor', 'end').attr('font-size', 12).attr('fill', COLOURS[e]).attr('font-weight', 600).text(name);
        svg.append('rect').attr('x', x(q(0.16))).attr('y', yy - rowH * 0.36).attr('width', Math.max(1, x(q(0.84)) - x(q(0.16)))).attr('height', rowH * 0.72).attr('fill', COLOURS[e]).attr('opacity', 0.22).attr('rx', 3);
        svg.append('line').attr('x1', x(mu)).attr('x2', x(mu)).attr('y1', yy - rowH * 0.42).attr('y2', yy + rowH * 0.42).attr('stroke', COLOURS[e]).attr('stroke-width', 2.5);
        svg.append('circle').attr('cx', x(draws[g][e])).attr('cy', yy).attr('r', 5).attr('fill', COLOURS[e]).attr('stroke', '#fcfcfb').attr('stroke-width', 1.5);
      });
    });
    // brackets with the two messages
    const bracket = (g0: number, g1: number, lines: string[]) => {
      const bx = W - mr + 10, y0 = y(g0, 0) - rowH * 0.4, y1 = y(g1, 2) + rowH * 0.4;
      svg.append('path').attr('d', `M${bx},${y0} h6 v${y1 - y0} h-6`).attr('fill', 'none').attr('stroke', '#52514e').attr('stroke-width', 1.2);
      const t = svg.append('text').attr('x', bx + 12).attr('y', (y0 + y1) / 2 - (lines.length - 1) * 7).attr('font-size', 12.5).attr('fill', '#1a1a1a');
      lines.forEach((l, i) => t.append('tspan').attr('x', bx + 12).attr('dy', i ? '1.2em' : 0).text(l));
    };
    bracket(0, 1, ['both hands dim all three;', 'left and right differ', 'only in degree']);
    bracket(2, 3, ['feet and tongue brighten', 'the hand electrodes;', 'they differ mainly at Cz']);
  }
  again.addEventListener('click', () => update(true));
  [sWin, sN, sF].forEach((s) => s.onChange(() => update(false)));
  new ResizeObserver(() => update(false)).observe(plotBox);
  update(false);
}

/** gamma quantile by bisection on the regularised incomplete gamma function */
function gammaQuantile(k: number, theta: number, p: number): number {
  let lo = 0, hi = theta * k * 10;
  for (let i = 0; i < 60; i++) { const mid = (lo + hi) / 2; if (gammaP(k, mid / theta) < p) lo = mid; else hi = mid; }
  return (lo + hi) / 2;
}
