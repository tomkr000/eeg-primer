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
  el.append(inDepth(body, 'What can change an EEG signal?'));
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
    <section class="rhythm-note">
      <h3>Reading the map</h3>
      <p>A rhythm is a repeating change in voltage. Alpha and mu can repeat at similar rates; their location and response to eye closure or movement help tell them apart ${c('rhythm-alpha')}${c('rhythm-mu')}${c('mu-vs-alpha')}.</p>
      <p class="rhythm-model-note">The later control demos give mu the same voltage amplitude as alpha. Since mu is usually weaker, this can make control look easier than it may be ${c('mu-vs-alpha')}.</p>
    </section>
    <section class="rhythm-note">
      <h3>Turning a change into a command</h3>
      <p>A computer can detect a change, such as weaker mu during imagined movement, and use it as a command ${c('self-generated-signals')}.</p>
      <p>For slow voltage shifts, people practise while watching feedback from their EEG. After months of training, some paralysed people learned to shift the voltage up or down. A spelling program used these two states to choose between groups of letters, repeatedly narrowing the group until one letter remained ${c('scp-control')}.</p>
    </section>
    <section class="rhythm-note rhythm-responses">
      <h3>Using a response to something on screen</h3>
      <p>These methods detect the brain’s response to an event ${c('evoked-map')}:</p>
      <ul>
        <li><strong>Flashing letters (P300).</strong> The computer flashes groups of letters. A characteristic voltage response when the target flashes helps it identify the letter you are attending to.</li>
        <li><strong>Flickering targets.</strong> Each target flickers at a different rate. The computer looks for a matching rhythm in your EEG to identify which target you are watching.</li>
        <li><strong>Noticing a mistake.</strong> Recognising that the computer made a wrong choice can produce an error-related voltage response, which can help the system detect and correct the error.</li>
      </ul>
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
