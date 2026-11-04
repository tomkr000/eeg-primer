import { claimCite as c } from '../data/params';
import { figure, inDepth, sw } from '../ui/layout';
import { MOTOR, ax, by } from './dim-model';
import { headGeometry, drawCortex } from './head-view';

const ALPHA = '#2a78d6', MU = '#eb6834', THETA = '#1baf7a', MUSCLE = '#898781', SCP = '#6250d6', ATTN = '#eda100', EYES = '#8a6d3b';

/** A signal map and short explanations, placed after section 4. */
export function mountSynchrony(root: HTMLElement) {
  const el = document.createElement('section');
  el.className = 'section question';
  el.id = 'synchrony';
  const body = document.createElement('div');
  body.className = 'section-note';
  el.append(inDepth(body, 'From patches to EEG signals'));
  const intro = document.createElement('div');
  intro.className = 'rhythm-intro';
  intro.innerHTML = `<p>Section 4 shows the scalp voltage at one instant. As activity changes across many patches, their voltage contributions add together at each electrode. Recording that changing voltage over time gives an EEG signal ${c('superposition')}${c('quasistatic')}.</p>
    <p>Repeating patterns in that signal are called rhythms ${c('rhythm-alpha')}${c('rhythm-mu')}. EEG also records brief responses to events, such as a flash on a screen ${c('evoked-map')}. Below, we map the ongoing signals, then show which patterns an interface can use as commands.</p>`;
  body.append(intro);
  root.append(el);
  const fig = figure(body, '', { panelWidth: '0px' });
  fig.el.classList.add('figure-note', 'rhythm-guide');
  const callout = (color: string, title: string, description: string, claims: string[]) =>
    `<div class="rhythm-callout"><h3>${sw(color)}${title}</h3><p>${description} ${claims.map(c).join('')}</p></div>`;
  fig.viz.innerHTML = `<div class="viz-title">Brain signals and interference, seen from above</div>
    <div class="rhythm-map">
      <div class="rhythm-labels rhythm-labels-left">
        ${callout(EYES, 'Eye movements', 'Blinks and moving eyes create large voltages that can hide brain signals.', ['blink-amplitude'])}
        ${callout(MUSCLE, 'Jaw and temple muscles', 'Tensing these muscles can overwhelm the brain’s faster rhythms.', ['gamma-scalp'])}
        ${callout(ATTN, 'Attention (parietal alpha)', 'Shifting attention changes where alpha is strongest, even when your eyes stay still.', ['covert-attention'])}
      </div>
      <canvas class="rhythm-head" width="320" height="400" role="img" aria-label="Head seen from above. Eye signals are strongest at the front; muscle signals at the temples. Theta is near the front midline, mu and beta over movement areas, alpha toward the back, and an outlined electrode at the top of the head records slow voltage shifts. Regions are schematic."></canvas>
      <div class="rhythm-labels rhythm-labels-right">
        ${callout(THETA, 'Mental effort (theta)', 'This rhythm often strengthens during tasks such as mental arithmetic.', ['rhythm-theta', 'frontal-control'])}
        ${callout(MU, 'Movement (mu and beta)', 'These rhythms weaken when you move or imagine moving.', ['rhythm-mu', 'rhythm-beta'])}
        ${callout(SCP, 'Slow voltage shifts', 'This electrode records voltage changes over seconds. Some people learn to shift the voltage up or down to choose between two options.', ['scp-control'])}
        ${callout(ALPHA, 'Eyes closed (alpha)', 'This rhythm is usually stronger with your eyes closed and weaker when you look at something.', ['rhythm-alpha'])}
      </div>
    </div><p class="rhythm-map-key">Shaded areas show approximate locations; the outlined ring marks a recording electrode.</p>`;
  drawRhythmMap(fig.viz.querySelector('canvas')!.getContext('2d')!);

  fig.caption.innerHTML = `<div class="rhythm-notes">
    <section class="rhythm-note rhythm-responses">
      <h3>Main signals used for EEG control</h3>
      <p>The map shows several kinds of recorded activity. These approaches turn a recognisable pattern into a command or choice:</p>
      <table class="rhythm-control-table">
        <thead><tr><th scope="col">Signal</th><th scope="col">What you do</th><th scope="col">What the computer detects</th></tr></thead>
        <tbody>
          <tr><th scope="row">${sw(MU)}Movement rhythms<br><span>mu and beta</span></th><td data-label="What you do">Imagine moving a hand or foot.</td><td data-label="What the computer detects">A change in rhythm strength over brain areas involved in movement ${c('self-generated-signals')}.</td></tr>
          <tr><th scope="row">P300 response</th><td data-label="What you do">Attend to a target letter while groups of letters flash.</td><td data-label="What the computer detects">A distinctive voltage response after flashes that include your target ${c('evoked-map')}.</td></tr>
          <tr><th scope="row">Flicker response<br><span>steady-state visual evoked potential (SSVEP)</span></th><td data-label="What you do">Watch one of several targets, each flickering at a different rate.</td><td data-label="What the computer detects">A repeating response at the flicker rate of the target you watch ${c('evoked-map')}.</td></tr>
          <tr><th scope="row">${sw(SCP)}Slow cortical potentials</th><td data-label="What you do">Use an on-screen indicator to practise shifting your recorded voltage up or down.</td><td data-label="What the computer detects">A slow voltage shift. Some trained users have used these shifts to choose between groups of letters until one letter remains ${c('scp-control')}.</td></tr>
        </tbody>
      </table>
      <p class="rhythm-model-note">Movement rhythms and slow shifts can be trained for control; P300 and flicker interfaces use responses to displayed targets ${c('self-generated-signals')}${c('scp-control')}.</p>
    </section>
    <section class="rhythm-note">
      <h3>Telling rhythms apart</h3>
      <p>Alpha and mu can repeat at similar rates; their location and response to eye closure or movement help tell them apart ${c('rhythm-alpha')}${c('rhythm-mu')}${c('mu-vs-alpha')}.</p>
      <p class="rhythm-model-note">The later control demos give mu the same voltage amplitude as alpha. Since mu is usually weaker, this can make control look easier than it may be ${c('mu-vs-alpha')}.</p>
    </section>
    <section class="rhythm-note">
      <h3>Other signals can help</h3>
      <p>Closing the eyes can make alpha act as an on/off switch; mental tasks can also produce patterns a computer can distinguish ${c('self-generated-signals')}${c('frontal-control')}.</p>
      <p>Recognising a wrong choice can produce an error-related response, helping an interface detect a mistake ${c('evoked-map')}.</p>
    </section>
    <section class="rhythm-note rhythm-timing">
      <h3>How neurons keep time together</h3>
      <p>Groups of neurons can share a rhythm through common input or repeated pauses in activity. Activity can also travel from one group to the next, forming a wave ${c('sync-thalamic')}${c('sync-inhibition')}${c('sync-waves')}.</p>
      ${synchronySvg()}
    </section>
    <section class="rhythm-note rhythm-waves">
      <h3>Could a travelling wave become a command?</h3>
      <p>Scalp EEG mixes signals from different places, making waves that cover small areas harder to distinguish ${c('waves-control')}. Detecting a wave is also different from controlling it: these studies do not show a person deliberately changing waves to steer a computer.</p>
    </section>
  </div>`;
  const next = document.createElement('p');
  next.className = 'rhythm-next';
  next.innerHTML = '<a href="#noise">Next: can we pick out one rhythm?</a> Section 5 follows an alpha rhythm at one electrode and adds the other signals and noise that can hide it.';
  body.append(next);
}

/** The same head geometry as section 4; callout text stays in HTML so it wraps and remains accessible. */
function drawRhythmMap(ctx: CanvasRenderingContext2D) {
  const W = 320, H = 400, geo = headGeometry(W, H), { cx, cy, s } = geo;
  drawCortex(ctx, { ...geo, grid: () => {} }, []);
  type Region = { x: number; y: number; rx: number; ry: number };
  const blob = (r: Region, color: string, alpha = 0.28) => {
    ctx.save(); ctx.globalAlpha = alpha; ctx.fillStyle = color;
    ctx.beginPath(); ctx.ellipse(r.x, r.y, r.rx * s, r.ry * s, 0, 0, 2 * Math.PI); ctx.fill();
    ctx.globalAlpha = 1; ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.stroke(); ctx.restore();
  };
  const motor = MOTOR(), at = (i: number) => geo.srcXY[motor[i].center];
  const alpha: Region = { x: cx, y: cy + 0.58 * by * s, rx: 0.46 * ax, ry: 0.26 * by };
  const attn: Region = { x: cx, y: cy + 0.24 * by * s, rx: 0.42 * ax, ry: 0.1 * by };
  const mu: Region = { x: (at(0)[0] + at(1)[0]) / 2, y: (at(0)[1] + at(1)[1]) / 2, rx: Math.abs(at(1)[0] - at(0)[0]) / (2 * s) + 16, ry: 16 };
  const vertex: Region = { x: cx, y: cy, rx: 8, ry: 8 };
  const theta: Region = { x: cx, y: cy - 0.4 * by * s, rx: 14, ry: 16 };
  const temple = (sgn: number): Region => ({ x: cx + sgn * 0.88 * ax * s, y: cy - 0.05 * by * s, rx: 10, ry: 24 });
  const eye = (sgn: number): Region => ({ x: cx + sgn * 0.3 * ax * s, y: cy - 0.82 * by * s, rx: 8, ry: 6 });
  blob(alpha, ALPHA); blob(attn, ATTN); blob(mu, MU); blob(theta, THETA);
  for (const sgn of [-1, 1]) { blob(temple(sgn), MUSCLE); blob(eye(sgn), EYES, 0.5); }
  // This is a recording site, not a tiny cortical generator of all slow potentials.
  ctx.beginPath(); ctx.arc(vertex.x, vertex.y, vertex.rx * s, 0, 2 * Math.PI);
  ctx.fillStyle = '#fcfcfb'; ctx.fill(); ctx.strokeStyle = SCP; ctx.lineWidth = 2.5; ctx.stroke();
  geo.outline(ctx);
  const leader = (right: boolean, y: number, color: string, r: Region) => {
    ctx.strokeStyle = color; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(r.x + (right ? 1 : -1) * r.rx * s, r.y);
    ctx.lineTo(right ? W : 0, y); ctx.stroke();
  };
  leader(false, 16, EYES, eye(-1));
  leader(false, 149, MUSCLE, temple(-1));
  leader(false, 282, ATTN, attn);
  leader(true, 16, THETA, theta);
  leader(true, 116, MU, mu);
  leader(true, 216, SCP, vertex);
  leader(true, 316, ALPHA, alpha);
}

/** Timing traces: one row per group of neurons, with common timing or a delay between groups. */
function synchronySvg(): string {
  const panel = (title: string, description: string, delayed: boolean, pause = false) => {
    const traces = [0, 1, 2].map((row) => {
      const shift = delayed ? row * 18 : 0;
      const points = Array.from({ length: 151 }, (_, i) => {
        const phase = (i - shift) * Math.PI / 30;
        const amplitude = pause ? Math.max(0, Math.sin(phase)) : Math.sin(phase);
        return `${20 + i},${77 + row * 24 - amplitude * 7}`;
      }).join(' ');
      return `<polyline points="${points}" fill="none" stroke="#2a78d6" stroke-width="2"/>`;
    }).join('');
    const guides = delayed
      ? '<path d="M35,65 L71,137 M95,65 L131,137" stroke="#898781" stroke-dasharray="3 3"/>'
      : '<path d="M35,65 V137 M95,65 V137 M155,65 V137" stroke="#898781" stroke-dasharray="3 3"/>';
    return `<svg class="sync-svg" viewBox="0 0 210 158" width="210" height="158" role="img" aria-label="${title}: ${description}"><text x="0" y="18" class="sync-heading">${title}</text><text x="0" y="40">${description}</text>${guides}${traces}</svg>`;
  };
  return `<div class="rhythm-sync">
    ${panel('Common input', 'One signal sets the timing.', false)}
    ${panel('Shared inhibition', 'Cells suppress activity together.', false, true)}
    ${panel('Travelling wave', 'Peaks arrive later in each group.', true)}
  </div><p class="rhythm-trace-key">Illustration: each line shows a group’s activity over time, from left to right. Dashed guides follow the peaks; flat stretches show shared pauses.</p>`;
}
