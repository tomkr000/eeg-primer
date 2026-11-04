import { snrVersusElectrodes } from '../physics/control';
import { simulateArm, successRate, commandNoise, ARM, type ArmTrial } from '../physics/arm';
import { controls, readout, slider, choice, fmt } from '../ui/slider';
import { P, claimCite as c } from '../data/params';
import { section, figure, prose, readouts, assumptions, sw } from '../ui/layout';
import { CANVAS_FONT, textWithSwatches, partsWidth, type TextPart } from '../ui/field';
import { sourceSliders, momentNam } from './s5-noise';
import { MOTOR, coherentPattern, miniW, miniIn, G, nCh, POS, NEG, visible, ax, by } from './dim-model';
import { headGeometry, titledCanvas, footnote } from './head-view';

/** each patch's channel: the best linear combination of a 64-electrode cap against the brain's background (section 9) */
const CAP = { electrodes: 64, noiseUv: 1, bgUv: 10, radiusMm: 10 };
const [cap] = snrVersusElectrodes([CAP.electrodes], CAP.noiseUv, CAP.bgUv, CAP.radiusMm);
/** rhythm power over the channel's noise power for the patch of the N and synchrony sliders */
const rhoOf = (N: number, f: number) => (momentNam(N, f) * cap.withBrain) ** 2;

/** the imagined movements in the order the joints take them, joint 1 at the base */
const TASKS = [
  { name: 'right hand', colour: '#2a78d6' },
  { name: 'left hand', colour: '#eb6834' },
  { name: 'feet', colour: '#1baf7a' },
  { name: 'tongue', colour: '#6250d6' },
];
const NONE = '#898781';
const jointColour = (k: number) => (k < TASKS.length ? TASKS[k].colour : NONE);
/** the five motor patches of section 4 and the movement whose own area each is (the left hemisphere's hand area moves the right hand) */
const PATCHES = MOTOR();
const OWNER = [0, 1, 2, 3, 3];
/** log change of each patch's power for a full imagined movement (claims mi-matrix and tongue-areas) */
const LOG = P.miResponse.map((r) => r.map((v) => Math.log(1 + v / 100)));
/** scalp pattern of each patch, µV at each electrode per nA·m, and the background power every electrode adds (µV²) */
const UNIT = PATCHES.map((p) => coherentPattern(p.center, p.radiusMm, 1).a);
const BG2 = CAP.bgUv ** 2 + CAP.noiseUv ** 2;
const TRIALS = 100;
const SIGNS = [1, -1, 1, -1, 1]; // the scrunched start folds the arm in alternate directions

export function mountDimensions(root: HTMLElement) {
  const sec = section(root, 'dimensions', '7', 'A head with EEG can operate only a few dimensions', 'Few rhythms can be changed at will, their changes overlap, and each change is smaller than the rhythm’s own swings');
  prose(sec.text, `
<p>To drive a robot arm a person needs one signal per joint, each moved at will without moving the others. The
scalp could carry many such signals: in the head of section 4 a decoder that knows the patches' scalp patterns
separates the figure's five motor patches with 128 electrodes and keeps 89% to nearly all of each one's
signal-to-noise ratio, counted in power ${c('cap-separates')}, and section 9 showed that about 64 electrodes read a
patch nearly as well as any cap can. The shortage is in what a person can move. The signals a person changes at will
that show from outside are the sensorimotor rhythms (the aside after section 4 maps the others), changed by imagining
a movement: the mu rhythm over that body part's area loses part of its power (event-related desynchronization,
ERD), about half on average in one study and about 85% in the most reactive band in another ${c('erd-depth')}. The
body parts whose areas are large enough and far enough apart to be told apart from outside are few: the two hands,
the feet and the tongue, the four classes of the imagery competitions ${c('mi-classes')}. The figure gives each joint
one of them, so a fifth joint gets none; the tongue's own area is small and spread over both hemispheres, and the
figure grants it a response as deep as a hand area's, though no scalp measurement of its size could be found
${c('tongue-areas')}. Nor
does each movement act on its own area alone. Imagining either hand dims both hand areas and the foot area, the
opposite hand's area most ${c('mi-matrix')}${c('mi-overlap')}; imagining the feet or the tongue makes the hand areas'
rhythm grow, by 90 to 145% on average ${c('mi-matrix')}. The area at work loses its rhythm while idle areas gain
theirs, a pattern read as the active area inhibiting the others through the thalamus, where a model of it relies on
cross-talk between the parts of the reticular nucleus that serve distinct sensory modules; not everyone shows it
${c('surround-ers')}. To the decoder, imagining the feet therefore looks much like imagining the hands less: the two
differ mainly at the foot area itself, next to the midline, whose rhythm falls by only a fifth on average
${c('mi-matrix')}, and toe movements change the scalp rhythm less consistently than finger movements
${c('own-rhythm')}.</p>
<p>A decoder calibrated on each movement alone can undo the overlap, but only by amplifying the noise: the more
joints, the smaller the differences it has to read and the larger each joint's command noise at rest. And each
reading is the power of a rhythm over a window, which scatters by about 1/√(BT) of its mean from one window to the
next, ±58% for a 3 Hz band over 1 s, however good the recording ${c('erd-detect')}; real alpha power scatters two to
three times more ${c('rhythm-fluctuation')}. The person in the figure controls perfectly: they know their own delays
(section 8), imagine exactly as much as each joint needs, and may combine movements at no cost, their changes adding
just as the decoder expects, while real users find holding several imagined movements hard and need extra practice
${c('compound-mi')}. Even so, with the rhythm as strong as section 5's alpha, one joint ends straight in nearly every
attempt, two in about one in four, three in one in ten or fewer, and a fifth joint never moves on purpose
${c('arm-success')}. Longer windows cut the noise as √T but slow every correction; measured accuracy for left-
against right-hand imagery climbs from about 65% with 1 s windows to 74% with 4 s ${c('window-accuracy')}. The record
agrees. People have learned two-dimensional control over weeks of training ${c('self-generated-signals')} and, four
adults, simultaneous control of three signals read from three or four electrodes ${c('dof-control')}; robots driven
by imagery have gained degrees of freedom by sequencing, by holding one fixed or by an on/off switch rather than by
more continuous signals, a robotic arm reaching in two dimensions and then grasping in a third ${c('robot-arm')}; adding a fourth or fifth mental task did not raise the
information rate ${c('task-limit')}. A four-way choice carries about 0.15 bits/s at best ${c('mi-bitrate')}, the best
interfaces of 2002 managed 10 to 25 bits per minute ${c('itr-2002')}, limb trajectories read from EEG did not beat
chance ${c('kinematics-chance')}, and control fails altogether for an estimated 15 to 30% of users
${c('bci-inefficiency')}. The fastest EEG spellers reach about 5 bits/s only by decoding responses to flickering
targets chosen by gaze, a selection rather than a dimension of control ${c('itr-ssvep')}; intracortical arrays, for
comparison, decode handwriting at 90 characters/min and speech at 62 words/min ${c('intracortical')}.</p>`);

  const sJoints = slider({ label: 'Joints to control', min: 1, max: 5, step: 1, value: 1, format: (v) => String(Math.round(v)), marks: [{ value: 3, label: 'Record: 3' }], note: c('dof-control') });
  let together = false;
  const pick = choice('Intended movement', [{ value: 'seq', label: 'One at a time' }, { value: 'all', label: 'All at once' }], 'seq', (v) => { together = v === 'all'; changed(); });
  const sWin = slider({ label: 'Window for each reading', unit: 's', min: 0.5, max: 4, step: 0.05, value: 1, marks: [{ value: 1, label: 'Typical' }], note: c('bci-windows') });
  const { sN, sF } = sourceSliders();
  const rAttempt = readout('This attempt');
  const rRate = readout(`Attempts out of ${TRIALS} that end straight`, c('arm-success'));
  const rNoise = readout('Each joint’s command noise at rest (1 = a full movement)', c('erd-detect'));
  const rUsed = readout('Imagined movements in use', c('mi-classes'));

  const fig = figure(sec.fig, `Left: the cortex from above with the five motor patches of section 4, each labelled with the imagined movement whose own area it is and shaded by its mu power at this moment, relative to rest; patches of movements that no joint uses are drawn without colour, but their rhythm changes all the same. Middle: the mu power each of the 128 electrodes sees, relative to rest: every patch's scalp pattern weighted by its power, on top of ${CAP.bgUv} µV of the brain's own activity in the band ${c('brain-background')}. Right: the intended arm and the arm the decoder drives, one joint per imagined movement with joint 1 at the base, and under them each joint's decoded command since Go. Press Go: the intended arm straightens, one joint at a time or all together, and the person imagines the movement of every joint that lags behind it, as much as it needs, knowing the delays of section 8. Every imagined movement changes every patch's rhythm by its measured response ${c('mi-matrix')}${c('tongue-areas')}${c('compound-mi')}; the decoder reads each patch's power over the window through the best combination of a 64-electrode cap (section 9) ${c('snr-electrodes')}${c('cap-separates')}, undoes the overlap of the responses, and moves a joint while its command is more than half a full movement either way. An attempt succeeds when all joints are within ${ARM.tolDeg}° of straight together for ${ARM.dwellS} s before the time runs out. The readouts give this attempt's outcome, the share of ${TRIALS} attempts with fixed seeds that succeed with the current settings ${c('arm-success')}, each joint's command noise while the person rests ${c('erd-detect')}, and the imagined movements in use ${c('mi-classes')}.`, { wide: true });
  const row = document.createElement('div');
  row.className = 'viz-row';
  row.style.flexWrap = 'nowrap';
  fig.viz.append(row);
  const WL = 400, WM = 340, H = 290, FOOT = 46, AW = 360;
  const left = titledCanvas(row, 'Patches the imagined movements change', WL, H + FOOT);
  const middle = titledCanvas(row, 'Mu power at the scalp, relative to rest', WM, H + FOOT);
  const armBox = document.createElement('div');
  armBox.className = 'viz-box';
  const armHead = document.createElement('div');
  armHead.className = 'arm-head';
  const title = document.createElement('div'); title.className = 'viz-title'; title.textContent = 'Intended arm and decoded arm';
  const go = document.createElement('button'); go.className = 'btn arm-btn'; go.textContent = 'Go';
  armHead.append(title, go);
  const right = document.createElement('canvas');
  right.width = AW; right.height = H + FOOT; right.className = 'glow'; right.style.width = `${AW}px`;
  armBox.append(armHead, right);
  row.append(armBox);
  const lctx = left.getContext('2d')!, mctx = middle.getContext('2d')!, actx = right.getContext('2d')!;
  const outs = readouts(rAttempt.el, rRate.el, rNoise.el, rUsed.el);
  outs.style.gridTemplateColumns = '1.3fr 1fr 1fr 0.8fr';
  fig.viz.append(outs);
  fig.panel.append(controls(sJoints.el, pick.el, sWin.el, sN.el, sF.el));
  const tag = (t: string) => `<span class="assumption-tag">${t}</span>`;
  assumptions(fig.el, [
    { what: 'Responses', value: 'the mean change of mu power at C3, C4 and Cz during imagined movements of the right hand, left hand, feet and tongue in nine people (trial-averaged, in the most reactive band of each person, electrode and movement, from Laplacian derivations), placed on the left and right hemispheres’ hand areas and the foot area of section 4; group means, which no single person matches (the spread across people is as large as the mean for the feet and tongue)', cite: c('mi-matrix') + c('mi-overlap') },
    { what: 'Tongue areas', value: 'lose 85% of their mu power during tongue imagery and do not respond to the other movements: a generous guess, since no scalp study gives the size', cite: c('tongue-areas') },
    { what: 'Several movements at once', value: 'their power changes multiply, each raised to the intensity of its imagery, which a decoder calibrated on single movements reads exactly apart from noise; combining costs the person nothing, which flatters the movements made together', cite: c('compound-mi') },
    { what: 'Timing', value: `the rhythm starts to change ${P.erdOnsetS} s after the imagery changes and takes ${P.erdRampS} s to change fully (section 8)`, cite: c('erd-timecourse') },
    { what: 'Channel', value: `each patch is read through the best linear combination of a ${CAP.electrodes}-electrode cap for a ${CAP.radiusMm} mm patch, against ${CAP.bgUv} µV of the brain's background and ${CAP.noiseUv} µV of electrode noise (section 9), which adds a floor of 1/ρ to every reading, ρ being the rhythm's power over the noise; the cap separates the patches from one another with little loss`, cite: c('snr-electrodes') + c('brain-background') + c('cap-separates') },
    { what: 'One reading', value: `the rhythm is band-limited Gaussian noise in a ${P.decoderBandHz} Hz band; its power over the trailing window is gamma distributed with about B·T degrees of freedom; real rhythms scatter more, so the model flatters the person`, cite: c('erd-detect') + c('window-samples') + c('rhythm-fluctuation') },
    { what: 'Decoder', value: `calibrated on each movement alone: the least-squares unmixing of the patches' log powers into one command per joint, 1 meaning the change of a full movement; a joint moves at up to ${ARM.speedDegS}°/s while its command is beyond ±${ARM.deadZone} (section 8's halfway threshold) and stops at ±${ARM.limitDeg}°; a fifth joint gets the one patch direction that no movement reaches`, cite: tag('model definition') },
    { what: 'Person', value: `an ideal controller: sees the arm, knows the delays and forecasts their effect, and imagines each lagging joint's movement in proportion to its gap, revising ${Math.round(1 / (ARM.dt * ARM.planEvery))} times a second; one movement at a time when the joints move one at a time`, cite: tag('model definition') },
    { what: 'Task', value: `start folded by ${ARM.startDeg.join('°, ')}° (joint 1 first), in alternate directions; the intended arm straightens each joint in ${ARM.stageS} s, or all together in ${ARM.togetherS} s; success: all joints within ${ARM.tolDeg}° of straight together for ${ARM.dwellS} s, at most ${ARM.graceS} s after the intended arm has finished`, cite: tag('model definition') },
    { what: 'Slider ranges', value: 'windows from 0.5 s to the 4 s of the imagery competitions, around the typical 1 s', cite: c('bci-windows') },
  ]);

  const geo = headGeometry(WL, H), geoM = headGeometry(WM, H);
  const mini = document.createElement('canvas'); mini.width = G; mini.height = G;
  const minctx = mini.getContext('2d')!, mimg = minctx.createImageData(G, G);
  const opts = () => ({ joints: Math.round(sJoints.value), together, rho: rhoOf(sN.value, sF.value), windowS: sWin.value, bandHz: P.decoderBandHz, onsetS: P.erdOnsetS, rampS: P.erdRampS });

  /** opacity of a patch disc for its mu power relative to rest: ×0.25 faint, ×1 middling, ×4 solid */
  const shade = (p: number) => 0.08 + 0.84 * Math.max(0, Math.min(1, (Math.log2(p) + 2) / 4));
  /** label slots outside the head for the tongue and hand areas, below the patch for the feet */
  const slot = (j: number): [number, number, CanvasTextAlign] => {
    const [px, py] = geo.srcXY[PATCHES[j].center], edge = ax * geo.s + 6;
    if (j === 2) return [px, py + 64, 'center'];
    const sideX = px < geo.cx ? geo.cx - edge : geo.cx + edge, dy = OWNER[j] === 3 ? -24 : 24;
    return [sideX, py + dy, px < geo.cx ? 'right' : 'left'];
  };
  function drawPatches(power: number[], imagery: number[], K: number) {
    lctx.clearRect(0, 0, WL, H + FOOT);
    geo.grid(lctx);
    lctx.fillStyle = 'rgba(26,26,26,0.18)';
    for (const [x, y, z] of geo.srcXY) { if (!visible(z)) continue; lctx.beginPath(); lctx.arc(x, y, 1.2, 0, 2 * Math.PI); lctx.fill(); }
    const used = Math.min(K, TASKS.length), r = Math.max(6, 10 * geo.s);
    PATCHES.forEach((p, j) => {
      const [px, py] = geo.srcXY[p.center], own = OWNER[j], col = own < used ? TASKS[own].colour : NONE, [lx, ly, align] = slot(j);
      // leader from the disc's edge to the label
      const tx = align === 'center' ? lx : lx + (align === 'right' ? 3 : -3), ty = align === 'center' ? ly - 17 : ly - 5, ang = Math.atan2(ty - py, tx - px);
      lctx.strokeStyle = '#52514e'; lctx.lineWidth = 1;
      lctx.beginPath(); lctx.moveTo(px + r * Math.cos(ang), py + r * Math.sin(ang)); lctx.lineTo(tx, ty); lctx.stroke();
      lctx.globalAlpha = shade(power[j]); lctx.fillStyle = col;
      lctx.beginPath(); lctx.arc(px, py, r, 0, 2 * Math.PI); lctx.fill();
      lctx.globalAlpha = 1; lctx.strokeStyle = col; lctx.lineWidth = imagery[own] > 0 ? 3.5 : 1.5; lctx.stroke();
      lctx.textAlign = align; lctx.font = imagery[own] > 0 ? 'bold 14px system-ui, sans-serif' : CANVAS_FONT;
      if (align === 'center') { const w = Math.max(lctx.measureText(TASKS[own].name).width, 40) + 8; lctx.fillStyle = 'rgba(252,252,251,0.85)'; lctx.fillRect(lx - w / 2, ly - 14, w, 33); }
      lctx.fillStyle = '#1a1a1a'; lctx.fillText(TASKS[own].name, lx, ly);
      lctx.fillStyle = '#52514e'; lctx.font = '12px system-ui, sans-serif';
      lctx.fillText(`×${fmt(power[j], 2)}`, lx, ly + 14);
    });
    geo.outline(lctx);
    footnote(lctx, H, [['each disc: one patch of section 4, labelled with the movement'], ['whose own area it is and shaded by its mu power now:'], [{ sw: 'rgba(26,26,26,0.12)' }, '×0.25 of rest   ', { sw: 'rgba(26,26,26,0.5)' }, '×1   ', { sw: 'rgba(26,26,26,0.92)' }, '×4;  thick ring: being imagined']]);
  }

  /** the electrodes' mu power relative to rest: every patch's pattern weighted by its power, on top of the background */
  function drawScalp(power: number[], Q: number) {
    mctx.clearRect(0, 0, WM, H + FOOT);
    const ratio = new Float64Array(nCh);
    for (let e = 0; e < nCh; e++) {
      let rest = BG2, now = BG2;
      for (let j = 0; j < PATCHES.length; j++) { const v = (Q * UNIT[j][e]) ** 2; rest += v; now += v * power[j]; }
      ratio[e] = Math.log2(now / rest);
    }
    const d = mimg.data, SAT = 0.5;
    for (let g = 0; g < G * G; g++) {
      if (!miniIn[g]) { d[g * 4 + 3] = 0; continue; }
      let v = 0; for (let e = 0; e < nCh; e++) v += miniW[g * nCh + e] * ratio[e];
      const col = v >= 0 ? POS : NEG;
      d[g * 4] = col[0]; d[g * 4 + 1] = col[1]; d[g * 4 + 2] = col[2]; d[g * 4 + 3] = Math.round(225 * Math.min(1, Math.abs(v) / SAT));
    }
    minctx.putImageData(mimg, 0, 0);
    mctx.save(); geoM.headPath(mctx); mctx.clip(); mctx.imageSmoothingEnabled = true;
    mctx.drawImage(mini, geoM.cx - ax * geoM.s, geoM.cy - by * geoM.s, 2 * ax * geoM.s, 2 * by * geoM.s);
    mctx.restore();
    geoM.grid(mctx);
    mctx.fillStyle = 'rgba(26,26,26,0.7)';
    for (const [x, y, z] of geoM.elXY) { if (!visible(z)) continue; mctx.beginPath(); mctx.arc(x, y, 1.8, 0, 2 * Math.PI); mctx.fill(); }
    geoM.outline(mctx);
    const f = 2 ** SAT;
    footnote(mctx, H, [[{ sw: `rgb(${NEG.join(',')})` }, 'weaker than at rest, ', { sw: `rgb(${POS.join(',')})` }, 'stronger'], [`solid at ×${fmt(1 / f, 2)} and ×${fmt(f, 2)}: what each of 128 electrodes sees,`], [`the patches on top of ${CAP.bgUv} µV of the brain's own activity`]]);
  }

  /** the two arms: joint angles in degrees, 0 straight */
  function drawArms(want: number[], got: number[], imagery: number[], t: number, trial: ArmTrial | null, i = 0) {
    actx.clearRect(0, 0, AW, H + FOOT);
    const K = want.length, total = 80 + 16 * K, len = total / K, baseY = 188, bases: [number, number][] = [[AW / 4, baseY], [(3 * AW) / 4, baseY]];
    actx.strokeStyle = '#c3c2b7'; actx.lineWidth = 2; actx.beginPath(); actx.moveTo(10, baseY + 16); actx.lineTo(AW - 10, baseY + 16); actx.stroke();
    [want, got].forEach((angles, a) => {
      const [bx, by] = bases[a];
      actx.save(); actx.beginPath(); actx.rect(a * AW / 2 + 2, 28, AW / 2 - 4, by + 16 - 28); actx.clip(); // each arm in its half, above the table
      actx.save(); actx.setLineDash([4, 4]); actx.strokeStyle = '#c3c2b7'; actx.lineWidth = 1.5;
      actx.beginPath(); actx.moveTo(bx, by); actx.lineTo(bx, by - total); actx.stroke(); actx.restore();
      actx.fillStyle = '#52514e'; actx.fillRect(bx - 16, by + 6, 32, 10);
      const pts: [number, number][] = [[bx, by]];
      let phi = 0, x = bx, y = by;
      angles.forEach((th, k) => { phi += SIGNS[k] * th * Math.PI / 180; x += len * Math.sin(phi); y -= len * Math.cos(phi); pts.push([x, y]); });
      actx.lineCap = 'round'; actx.lineJoin = 'round'; actx.strokeStyle = '#898781'; actx.lineWidth = 8;
      actx.beginPath(); actx.moveTo(...pts[0]); pts.slice(1).forEach((p) => actx.lineTo(...p)); actx.stroke();
      const ang = phi, ux = Math.sin(ang), uy = -Math.cos(ang), nx = -uy, ny = ux, [hx, hy] = pts[K];
      actx.strokeStyle = '#1a1a1a'; actx.lineWidth = 2.5;
      for (const s of [1, -1]) { actx.beginPath(); actx.moveTo(hx + s * 6 * nx, hy + s * 6 * ny); actx.lineTo(hx + s * 6 * nx + 10 * ux, hy + s * 6 * ny + 10 * uy); actx.stroke(); }
      for (let k = 0; k < K; k++) {
        actx.beginPath(); actx.arc(pts[k][0], pts[k][1], 6.5, 0, 2 * Math.PI);
        actx.fillStyle = jointColour(k); actx.fill(); actx.strokeStyle = '#fcfcfb'; actx.lineWidth = 1.5; actx.stroke();
      }
      actx.restore();
      actx.font = CANVAS_FONT; actx.fillStyle = '#1a1a1a'; actx.textAlign = 'center';
      actx.fillText(a ? 'Decoded from EEG' : 'Intended', bx, by + 36);
    });
    // what the person is imagining, or the outcome
    actx.font = '13px system-ui, sans-serif'; actx.fillStyle = '#1a1a1a';
    let parts: TextPart[];
    if (!trial) parts = ['Press Go: the left arm shows the intended movement'];
    else if (t < trial.end - 1e-9 || isNaN(trial.doneAt)) {
      const active = imagery.map((u, j) => (u > 0 ? j : -1)).filter((j) => j >= 0);
      parts = active.length ? ['Imagining: ', ...active.flatMap((j, i) => [{ sw: TASKS[j].colour }, TASKS[j].name + (i < active.length - 1 ? ', ' : '')])] : ['Imagining nothing: resting'];
      if (t >= trial.end - 1e-9) parts = [outcome(trial)];
    } else parts = [outcome(trial)];
    const w = partsWidth(actx, parts, 12);
    actx.fillStyle = 'rgba(252,252,251,0.9)'; actx.fillRect(4, 6, w + 8, 18);
    actx.fillStyle = '#1a1a1a'; textWithSwatches(actx, parts, 8, 19, 12);
    // each joint's decoded command since Go, against the band too small to move a joint
    const x0 = 34, x1 = AW - 12, top = 248, bot = 284, mid = (top + bot) / 2, yc = (v: number) => mid - (Math.max(-2, Math.min(2, v)) / 2) * ((bot - top) / 2);
    const tMax = trial ? Math.max(trial.end, 1) : 1, xt = (s: number) => x0 + (s / tMax) * (x1 - x0);
    actx.fillStyle = '#e8e7e1'; actx.fillRect(x0, yc(ARM.deadZone), x1 - x0, yc(-ARM.deadZone) - yc(ARM.deadZone));
    actx.strokeStyle = '#c3c2b7'; actx.lineWidth = 1; actx.strokeRect(x0, top, x1 - x0, bot - top);
    actx.font = '12px system-ui, sans-serif'; actx.fillStyle = '#52514e'; actx.textAlign = 'right';
    actx.fillText('+2', x0 - 4, top + 9); actx.fillText('0', x0 - 4, mid + 4); actx.fillText('−2', x0 - 4, bot);
    if (trial) {
      const i0 = trial.t.findIndex((v) => v >= 0);
      trial.command.forEach((cmd, k) => {
        actx.strokeStyle = jointColour(k); actx.lineWidth = 1.3; actx.beginPath();
        for (let m = i0; m <= i; m++) { const X = xt(trial.t[m]), Y = yc(cmd[m]); if (m === i0) actx.moveTo(X, Y); else actx.lineTo(X, Y); }
        actx.stroke();
      });
      actx.textAlign = 'right'; actx.fillStyle = '#1a1a1a'; actx.fillText(`${fmt(Math.min(t, tMax), 2)} s after Go`, x1, top - 4);
    }
    actx.textAlign = 'left'; actx.fillStyle = '#1a1a1a'; actx.fillText('decoded commands', x0, top - 4);
    footnote(actx, H, [['joints from the base, each moved by one imagined movement:'], TASKS.slice(0, K).flatMap((m, k) => [{ sw: m.colour }, `${k + 1} ${m.name} `] as TextPart[]).concat(K > TASKS.length ? [{ sw: NONE }, '5 none'] : []), [{ sw: '#e8e7e1' }, 'command too small to move its joint']]);
  }

  function outcome(r: ArmTrial): string {
    if (!isNaN(r.doneAt)) return `All joints straight after ${fmt(r.doneAt, 2)} s`;
    const last = r.actual.map((a) => a[a.length - 1]), worst = last.reduce((b, v, k) => (Math.abs(v) > Math.abs(last[b]) ? k : b), 0);
    return `Time is up: joint ${worst + 1} still ${Math.round(Math.abs(last[worst]))}° from straight`;
  }

  // the idle picture, an attempt in motion, and the readouts
  let trial: ArmTrial | null = null, raf = 0, presses = 0;
  function idle() {
    cancelAnimationFrame(raf); trial = null; go.disabled = false;
    const K = Math.round(sJoints.value), rest = new Array(PATCHES.length).fill(1), start = ARM.startDeg.slice(0, K);
    drawPatches(rest, new Array(TASKS.length).fill(0), K); drawScalp(rest, momentNam(sN.value, sF.value)); drawArms(start, start, [], 0, null);
    rAttempt.set('not run yet');
  }
  function frame(i: number, tNow: number) {
    const r = trial!, K = r.actual.length, power = r.power.map((p) => p[i]), imagery = TASKS.map((_, j) => (j < r.imagery.length ? r.imagery[j][i] : 0));
    drawPatches(power, imagery, K); drawScalp(power, momentNam(sN.value, sF.value));
    drawArms(r.desired.map((a) => a[i]), r.actual.map((a) => a[i]), imagery, tNow, r, i);
  }
  go.addEventListener('click', () => {
    cancelAnimationFrame(raf);
    trial = simulateArm(LOG, { ...opts(), seed: 1000 + ++presses });
    const r = trial, i0 = r.t.findIndex((v) => v >= 0), start = performance.now();
    go.disabled = true; rAttempt.set('running');
    const step = (now: number) => {
      const tNow = Math.min(r.end, (now - start) / 1000), i = Math.min(r.t.length - 1, i0 + Math.round(tNow / ARM.dt));
      frame(i, tNow);
      if (tNow >= r.end) { go.disabled = false; rAttempt.set(outcome(r)); return; }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
  });

  let pending = 0;
  function changed() {
    idle();
    const o = opts(), K = o.joints;
    const noise = commandNoise(LOG, o);
    rNoise.set(noise.map((v, k) => `${sw(jointColour(k))}${fmt(v, 2)}`).join(' '));
    rUsed.set(K > TASKS.length ? `all ${TASKS.length} <span class="readout-aside">and none for joint 5</span>` : `${K} of ${TASKS.length}`);
    rRate.set('…');
    clearTimeout(pending);
    pending = window.setTimeout(() => { const s = successRate(LOG, o, TRIALS); rRate.set(`${Math.round(100 * s.rate)}%${s.rate > 0 ? ` <span class="readout-aside">in ${fmt(s.meanTime, 2)} s on average</span>` : ''}`); }, 120);
  }
  [sJoints, sWin, sN, sF].forEach((s) => s.onChange(changed));
  changed();
}
