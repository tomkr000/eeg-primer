import { snrVersusElectrodes } from '../physics/control';
import { simulateArm, successRate, commandNoise, ARM, type ArmTrial } from '../physics/arm';
import { controls, readout, slider, choice, fmt } from '../ui/slider';
import { P, claimCite as c } from '../data/params';
import { section, figure, prose, readouts, assumptions, sw } from '../ui/layout';
import { CANVAS_FONT, textWithSwatches, partsWidth, type TextPart } from '../ui/field';
import { sourceSliders, momentNam } from './s5-noise';
import { MOTOR, coherentPattern, miniW, miniIn, G, nCh, POS, NEG, visible, ax, by } from './dim-model';
import { headGeometry, titledCanvas, footnote } from './head-view';

/** each patch's channel: the best linear combination of a 64-electrode cap against the brain's background (section 11) */
const CAP = { electrodes: 64, noiseUv: 1, bgUv: 10, radiusMm: 10 };
const [cap] = snrVersusElectrodes([CAP.electrodes], CAP.noiseUv, CAP.bgUv, CAP.radiusMm);
/** rhythm power over the channel's noise power for the patch of the N and synchrony sliders */
const rhoOf = (N: number, f: number) => (momentNam(N, f) * cap.withBrain) ** 2;

/** the imagined movements in the order the joints take them, joint 1 at the base */
const TASKS = [
  { name: 'right hand', color: '#2a78d6' },
  { name: 'left hand', color: '#eb6834' },
  { name: 'feet', color: '#1baf7a' },
  { name: 'tongue', color: '#6250d6' },
];
const NONE = '#898781';
const jointColor = (k: number) => (k < TASKS.length ? TASKS[k].color : NONE);
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
  const sec = section(root, 'dimensions', '9', 'Overlapping rhythm changes make joint control harder', 'This simulation tests how shared responses and noise affect independent commands');
  prose(sec.text, `
<p>Continuous control needs commands that can change independently. This model uses imagined movements to change
sensorimotor mu rhythms. Power can fall over the area associated with an imagined movement. This decrease is
called event-related desynchronization (ERD)
${c('erd-depth')}. The model uses the right hand, left hand, feet and tongue, the four choices in a motor-imagery competition
${c('mi-classes')}. These choices do not establish a biological maximum. Section 6 describes other EEG signals
people can use.</p>
<p><strong>Separate patches can still respond to the same movement.</strong> In section 4's head model, a decoder
that knows the scalp patterns can separate the five motor patches using 128 electrodes. After canceling the other
patches, each estimate retains at least 89% of its signal-to-noise power ratio compared with reading that patch alone ${c('cap-separates')}.
That is a test of spatial separation. The overlap here is different: imagining one movement changes several areas.
In a study of nine people, hand imagery reduced mu power over both hand areas. Foot and tongue imagery instead
increased hand-area mu power by about 90 to 145% on average ${c('mi-matrix')}${c('mi-overlap')}.
A decoder can distinguish those response patterns, but doing so magnifies noise in its commands.</p>
<p><strong>The model makes generous assumptions.</strong> It assigns the measured electrode responses to the hand
and foot patches, using group averages rather than one person's responses ${c('mi-matrix')}${c('arm-response-model')}.
The tongue patches get an assumed 85% power drop; the sources checked did not measure that value
${c('tongue-areas')}. Simultaneous imagery multiplies the individual power factors and costs the person no extra
effort. This combination rule has not been validated; real users may need extra practice to combine movements
${c('compound-mi')}. A fifth joint has no assigned imagined movement in this model. Its failure is built into
that choice, rather than evidence that a person could never learn another control signal ${c('arm-decoder')}.</p>
<p><strong>Even a clean recording has variable rhythm power.</strong> For the modeled Gaussian rhythm, the
standard deviation of a power reading is approximately 1/√(BT) times its mean. B is the frequency bandwidth in hertz;
T is the reading window in seconds. With B = 3 Hz and T = 1 s, that relative standard deviation is about 58%.
The often-written “±58%” describes scatter, not bounds on possible readings ${c('erd-detect')}.
Measured resting alpha power varies more than this model predicts ${c('rhythm-fluctuation')}.
The model also gives mu the strength of section 7's alpha rhythm, an optimistic assumption ${c('mu-vs-alpha')}.</p>
<p><strong>The success rates are simulated.</strong> With the default settings, nearly every one-joint attempt
succeeds. About one in four two-joint attempts and one in ten or fewer three-joint attempts succeed
${c('arm-success')}. The modeled person knows the delays and selects the intended imagery perfectly ${c('arm-controller')}.
Longer windows reduce the modeled relative scatter in proportion to 1/√T, but make corrections arrive later
${c('erd-detect')}. In a separate study, median accuracy for left- versus right-hand imagery rose from about 65%
with 1 s windows to 74% with 4 s windows ${c('window-accuracy')}.</p>
<p>People have learned simultaneous control of three EEG signals in a cursor task ${c('dof-control')}.
EEG-controlled robots have also used sequences, fixed commands or a separate on/off choice to perform more complex
actions ${c('robot-arm')}. Those tasks differ from this arm simulation, so their results do not validate its
success rates or establish a universal limit.</p>`);

  const sJoints = slider({ label: 'Joints to control', min: 1, max: 5, step: 1, value: 1, format: (v) => String(Math.round(v)), marks: [{ value: 3, label: 'Demonstrated: 3' }], note: c('dof-control') });
  let together = false;
  const pick = choice('Intended movement', [{ value: 'seq', label: 'One at a time' }, { value: 'all', label: 'All at once' }], 'seq', (v) => { together = v === 'all'; changed(); });
  const sWin = slider({ label: 'Window for each reading', unit: 's', min: 0.5, max: 4, step: 0.05, value: 1, marks: [{ value: 1, label: 'Default' }], note: c('bci-windows') + c('arm-success') });
  const { sN, sF } = sourceSliders();
  const rAttempt = readout('This simulated attempt');
  const rRate = readout(`Success in ${TRIALS} simulated attempts`, c('arm-success'));
  const rNoise = readout('Command noise at rest', c('erd-detect') + c('arm-decoder'));
  const rUsed = readout('Imagined movements in use', c('mi-classes'));

  const fig = figure(sec.fig, `
<p><strong>Left:</strong> the five motor patches from section 4. Patches 1 and 2 are the hand areas in the left and
right hemispheres, associated with the opposite hands. Patch 3 is the foot area; patches 4 and 5 are the tongue
areas. Each disc uses its movement's joint color and is shaded by its current mu power relative to rest.
An unused movement's patches can still respond to other imagery ${c('mi-matrix')}${c('tongue-areas')}${c('arm-response-model')}.</p>
<p><strong>Middle:</strong> expected mu power at the 128 displayed electrodes, relative to rest, including an assumed
${CAP.bgUv} µV root-mean-square background ${c('brain-background')}${c('arm-response-model')}. This display shows the scalp pattern.
The arm decoder uses a separate noise estimate: each patch is read through a modeled ${CAP.electrodes}-electrode
channel from section 11 ${c('snr-electrodes')}. It does not decode the displayed 128-electrode map.</p>
<p><strong>Right:</strong> the intended arm, the decoded arm and each joint's command since Go. Joint 1 is at the
base. Press Go to play one simulated attempt. The ideal person adjusts imagery to straighten each assigned joint ${c('arm-controller')}.
“Full movement” means the model's maximum imagery intensity, not an arm angle. The decoder estimates patch power
over the selected window and separates the movement responses ${c('mi-matrix')}${c('tongue-areas')}${c('compound-mi')}.
A command outside ±${ARM.deadZone} moves its joint; 1 represents full imagery. Success means all joints stay within ${ARM.tolDeg}° of straight
for ${ARM.dwellS} s before the time limit ${c('arm-decoder')}${c('arm-task')}.</p>
<p>The readouts show this simulated attempt, the success rate across ${TRIALS} simulated attempts, command noise at
rest and the imagery choices in use ${c('arm-success')}. Repeating these settings repeats the same ${TRIALS} noise sequences and results ${c('arm-task')}. Command noise is a standard deviation, expressed
relative to the response to full imagery ${c('erd-detect')}. The fifth joint has no assigned imagery ${c('arm-decoder')}.</p>`, { wide: true });
  const lede = document.createElement('p');
  lede.className = 'figure-lede';
  lede.innerHTML = `<strong>Simulation of control from imagined movements.</strong> Each movement changes several patches. Separating those responses magnifies the noise, even when the person chooses the imagery perfectly ${c('mi-matrix')}${c('arm-success')}.`;
  fig.el.prepend(lede);
  const row = document.createElement('div');
  row.className = 'viz-row';
  row.style.flexWrap = 'nowrap';
  fig.viz.append(row);
  const WL = 340, WM = 340, H = 252, FOOT = 34, AW = 360;
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
  assumptions(fig.el, [
    { what: 'Measured responses', value: 'Mean mu-power changes from nine people, measured at C3, C4 and Cz using local electrode differences (Laplacian derivations). Each value uses the most reactive band for that person, site and movement. These are trial averages with substantial variation across people.', cite: c('mi-matrix') + c('mi-overlap') },
    { what: 'Mapping responses to patches', value: 'The measured electrode responses are assigned to the hand and foot patches from section 4. They are not direct measurements of those patches.', cite: c('arm-response-model') },
    { what: 'Tongue patches', value: 'Assumed to lose 85% of mu power during tongue imagery and to ignore other imagery. The sources checked give no measured value for this drop.', cite: c('tongue-areas') },
    { what: 'Simultaneous imagery', value: 'Each patch’s power factors multiply, with each factor raised to its imagery intensity. The log changes therefore add. Combining imagery has no effort cost. This optimistic rule has not been validated.', cite: c('compound-mi') },
    { what: 'Mu strength', value: 'Set equal to section 7’s alpha strength, which is optimistic for mu.', cite: c('mu-vs-alpha') },
    { what: 'Timing', value: `Power starts changing ${P.erdOnsetS} s after an imagery change and takes another ${P.erdRampS} s to reach the new level. These model defaults follow the cue-paced timing discussed in section 10.`, cite: c('erd-timecourse') },
    { what: 'Decoder channel', value: `Each patch gets the noise level of a ${CAP.radiusMm} mm patch read through a ${CAP.electrodes}-electrode cap in section 11’s sphere model. Background: ${CAP.bgUv} µV root mean square. Electrode noise: ${CAP.noiseUv} µV. If ρ is rhythm power divided by channel-noise power, the added noise floor is 1/ρ.`, cite: c('snr-electrodes') + c('brain-background') },
    { what: 'Spatial separation check', value: 'A separate computation uses the 128-electrode anatomical head to cancel the other patches. It retains 89% to 99.7% of each patch’s isolated squared signal-to-noise ratio. This supports separating the patches; it does not supply the arm’s channel-noise values.', cite: c('cap-separates') },
    { what: 'Power readings', value: `The rhythm is band-limited Gaussian noise with bandwidth B = ${P.decoderBandHz} Hz. T is the selected trailing window in seconds. Its power estimate is approximated by a gamma distribution with shape B·T. Real alpha power varies more.`, cite: c('erd-detect') + c('window-samples') + c('rhythm-fluctuation') },
    { what: 'Decoder and joints', value: `Calibrated on each movement alone. Least-squares weights turn patch log powers into one command per joint. A command of 1 represents full imagery intensity. A joint moves beyond ±${ARM.deadZone}, at up to ${ARM.speedDegS}°/s, and stops at ±${ARM.limitDeg}°. The fifth joint has no assigned movement; its decoder reads a response direction that none of the four imagery choices can produce.`, cite: c('arm-decoder') },
    { what: 'Ideal person', value: `Sees the arm and forecasts the effect of known delays without noise. Adjusts imagery ${Math.round(1 / (ARM.dt * ARM.planEvery))} times per second. In “One at a time” mode, imagines only one movement at once.`, cite: c('arm-controller') },
    { what: 'Task and success', value: `Starts with joints folded by ${ARM.startDeg.join('°, ')}°, in alternating directions. The target straightens each joint over ${ARM.stageS} s, or all joints over ${ARM.togetherS} s. Success requires every joint within ${ARM.tolDeg}° of straight for ${ARM.dwellS} s. The deadline is ${ARM.graceS} s after the target finishes.`, cite: c('arm-task') },
    { what: 'Repeated attempts', value: `The success rate uses ${TRIALS} fixed random seeds. Each seed specifies a reproducible simulated noise sequence. These are simulated attempts, not observations of people.`, cite: c('arm-success') + c('arm-task') },
    { what: 'Window range', value: 'The slider runs from 0.5 to 4 s, with a 1 s default. The upper end matches the imagery period in the competition data; these slider limits are model choices.', cite: c('bci-windows') + c('arm-task') },
  ]);

  const geo = headGeometry(WL, H), geoM = headGeometry(WM, H);
  const mini = document.createElement('canvas'); mini.width = G; mini.height = G;
  const minctx = mini.getContext('2d')!, mimg = minctx.createImageData(G, G);
  const opts = () => ({ joints: Math.round(sJoints.value), together, rho: rhoOf(sN.value, sF.value), windowS: sWin.value, bandHz: P.decoderBandHz, onsetS: P.erdOnsetS, rampS: P.erdRampS });

  /** opacity of a patch disc for its mu power relative to rest: ×0.25 faint, ×1 middling, ×4 solid */
  const shade = (p: number) => 0.08 + 0.84 * Math.max(0, Math.min(1, (Math.log2(p) + 2) / 4));
  function drawPatches(power: number[], imagery: number[], K: number) {
    lctx.clearRect(0, 0, WL, H + FOOT);
    geo.grid(lctx);
    lctx.fillStyle = 'rgba(26,26,26,0.18)';
    for (const [x, y, z] of geo.srcXY) { if (!visible(z)) continue; lctx.beginPath(); lctx.arc(x, y, 1.2, 0, 2 * Math.PI); lctx.fill(); }
    const used = Math.min(K, TASKS.length), r = Math.max(6, 10 * geo.s);
    PATCHES.forEach((p, j) => {
      const [px, py] = geo.srcXY[p.center], own = OWNER[j], col = own < used ? TASKS[own].color : NONE;
      lctx.globalAlpha = shade(power[j]); lctx.fillStyle = col;
      lctx.beginPath(); lctx.arc(px, py, r, 0, 2 * Math.PI); lctx.fill();
      lctx.globalAlpha = 1; lctx.strokeStyle = col; lctx.lineWidth = imagery[own] > 0 ? 3.5 : 1.5; lctx.stroke();
      // the number of section 4, legible on a faint or a solid disc
      lctx.font = 'bold 13px system-ui, sans-serif'; lctx.textAlign = 'center'; lctx.lineJoin = 'round';
      lctx.lineWidth = 3; lctx.strokeStyle = 'rgba(252,252,251,0.95)'; lctx.strokeText(String(j + 1), px, py + 5);
      lctx.fillStyle = '#1a1a1a'; lctx.fillText(String(j + 1), px, py + 5);
    });
    geo.outline(lctx);
    footnote(lctx, H, [['each disc shaded by that patch’s mu power now:'], [{ sw: 'rgba(26,26,26,0.12)' }, '×0.25 of rest   ', { sw: 'rgba(26,26,26,0.5)' }, '×1   ', { sw: 'rgba(26,26,26,0.92)' }, '×4;  thick ring: being imagined']]);
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
    footnote(mctx, H, [[{ sw: `rgb(${NEG.join(',')})` }, 'weaker than at rest, ', { sw: `rgb(${POS.join(',')})` }, `stronger: solid at ×${fmt(1 / f, 2)} and ×${fmt(f, 2)}`], [`128 electrodes, including ${CAP.bgUv} µV of brain background`]]);
  }

  /** the two arms: joint angles in degrees, 0 straight */
  function drawArms(want: number[], got: number[], imagery: number[], t: number, trial: ArmTrial | null, i = 0) {
    actx.clearRect(0, 0, AW, H + FOOT);
    const K = want.length, total = 64 + 14 * K, len = total / K, baseY = 158, bases: [number, number][] = [[AW / 4, baseY], [(3 * AW) / 4, baseY]];
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
        actx.fillStyle = jointColor(k); actx.fill(); actx.strokeStyle = '#fcfcfb'; actx.lineWidth = 1.5; actx.stroke();
      }
      actx.restore();
      actx.font = CANVAS_FONT; actx.fillStyle = '#1a1a1a'; actx.textAlign = 'center';
      actx.fillText(a ? 'Decoded from EEG' : 'Intended', bx, by + 34);
    });
    // what the person is imagining, or the outcome
    actx.font = '13px system-ui, sans-serif'; actx.fillStyle = '#1a1a1a';
    let parts: TextPart[];
    if (!trial) parts = ['Press Go: the left arm shows the intended movement'];
    else if (t < trial.end - 1e-9 || isNaN(trial.doneAt)) {
      const active = imagery.map((u, j) => (u > 0 ? j : -1)).filter((j) => j >= 0);
      parts = active.length ? ['Imagining: ', ...active.flatMap((j, i) => [{ sw: TASKS[j].color }, TASKS[j].name + (i < active.length - 1 ? ', ' : '')])] : ['Imagining nothing: resting'];
      if (t >= trial.end - 1e-9) parts = [outcome(trial)];
    } else parts = [outcome(trial)];
    const w = partsWidth(actx, parts, 12);
    actx.fillStyle = 'rgba(252,252,251,0.9)'; actx.fillRect(4, 6, w + 8, 18);
    actx.fillStyle = '#1a1a1a'; textWithSwatches(actx, parts, 8, 19, 12);
    // each joint's decoded command since Go, against the band too small to move a joint
    const x0 = 34, x1 = AW - 12, top = 212, bot = 246, mid = (top + bot) / 2, yc = (v: number) => mid - (Math.max(-2, Math.min(2, v)) / 2) * ((bot - top) / 2);
    const tMax = trial ? Math.max(trial.end, 1) : 1, xt = (s: number) => x0 + (s / tMax) * (x1 - x0);
    actx.fillStyle = '#e8e7e1'; actx.fillRect(x0, yc(ARM.deadZone), x1 - x0, yc(-ARM.deadZone) - yc(ARM.deadZone));
    actx.strokeStyle = '#c3c2b7'; actx.lineWidth = 1; actx.strokeRect(x0, top, x1 - x0, bot - top);
    actx.font = '12px system-ui, sans-serif'; actx.fillStyle = '#52514e'; actx.textAlign = 'right';
    actx.fillText('+2', x0 - 4, top + 9); actx.fillText('0', x0 - 4, mid + 4); actx.fillText('−2', x0 - 4, bot);
    if (trial) {
      const i0 = trial.t.findIndex((v) => v >= 0);
      trial.command.forEach((cmd, k) => {
        actx.strokeStyle = jointColor(k); actx.lineWidth = 1.3; actx.beginPath();
        for (let m = i0; m <= i; m++) { const X = xt(trial.t[m]), Y = yc(cmd[m]); if (m === i0) actx.moveTo(X, Y); else actx.lineTo(X, Y); }
        actx.stroke();
      });
      actx.textAlign = 'right'; actx.fillStyle = '#1a1a1a'; actx.fillText(`${fmt(Math.min(t, tMax), 2)} s after Go`, x1, top - 4);
    }
    actx.textAlign = 'left'; actx.fillStyle = '#1a1a1a'; actx.fillText('decoded commands', x0, top - 4);
    footnote(actx, H, [TASKS.slice(0, K).flatMap((m, k) => [{ sw: m.color }, `${k + 1} ${m.name} `] as TextPart[]).concat(K > TASKS.length ? [{ sw: NONE }, '5 none'] : []), ['joint 1 at the base;  ', { sw: '#e8e7e1' }, 'command too small to move its joint']]);
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
    rNoise.set(noise.map((v, k) => `${sw(jointColor(k))}${fmt(v, 2)}`).join(' '));
    rUsed.set(K > TASKS.length ? `all ${TASKS.length} <span class="readout-aside">and none for joint 5</span>` : `${K} of ${TASKS.length}`);
    rRate.set('…');
    clearTimeout(pending);
    pending = window.setTimeout(() => { const s = successRate(LOG, o, TRIALS); rRate.set(`${Math.round(100 * s.rate)}%${s.rate > 0 ? ` <span class="readout-aside">in ${fmt(s.meanTime, 2)} s on average</span>` : ''}`); }, 120);
  }
  [sJoints, sWin, sN, sF].forEach((s) => s.onChange(changed));
  changed();
}
