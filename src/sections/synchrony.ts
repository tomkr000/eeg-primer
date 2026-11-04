import { claimCite as c } from '../data/params';
import { figure, section, sw } from '../ui/layout';
import { MOTOR, ax, by } from './dim-model';
import { headGeometry, drawCortex } from './head-view';

const ALPHA = '#2a78d6', MU = '#eb6834', THETA = '#1baf7a', MUSCLE = '#898781', SCP = '#6250d6', ATTN = '#eda100', EYES = '#8a6d3b';

/** The main EEG signals, following the local-patch and voltage-sum illustration. */
export function mountSynchrony(root: HTMLElement) {
  const sec = section(root, 'synchrony', '6', 'EEG signals reveal rhythms and responses to events');
  sec.text.parentElement!.remove();
  const fig = figure(sec.fig, '', { panelWidth: '0px' });
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
        ${callout(THETA, 'Mental effort (theta)', 'Frontal theta often strengthens during demanding mental work and after errors.', ['theta-function'])}
        ${callout(MU, 'Movement (mu and beta)', 'These rhythms weaken when you move or imagine moving.', ['rhythm-mu', 'rhythm-beta'])}
        ${callout(SCP, 'Slow voltage shifts', 'This electrode records voltage changes over seconds. Some people learn to shift the voltage up or down to choose between two options.', ['scp-control'])}
        ${callout(ALPHA, 'Vision and attention (alpha)', 'Usually stronger with the eyes closed; its pattern also changes with visual attention.', ['alpha-function'])}
      </div>
    </div><p class="rhythm-map-key">Brain-signal ovals summarize broad areas containing many possible cortical patches. Boundaries are schematic and the associations overlap; the outlined ring marks a recording electrode ${c('patch-regions')}.</p>`;
  drawRhythmMap(fig.viz.querySelector('canvas')!.getContext('2d')!);

  fig.caption.innerHTML = `<div class="rhythm-notes">
    <section class="rhythm-note rhythm-responses">
      <h3>What EEG signals tell us</h3>
      <p>A <strong>rhythm</strong> is a repeating voltage pattern. Its strength is the size of the swings, which can stay steady while the voltage reverses sign ${c('rhythm-snapshot')}. Names partly reflect repetition rate; meaning also depends on location and context: theta occurs during mental tasks and early sleep ${c('theta-context')}.</p>
      <table class="rhythm-signal-table">
        <thead><tr><th scope="col">Signal</th><th scope="col">What it reflects</th><th scope="col">What it is useful for</th></tr></thead>
        <tbody>
          <tr><th scope="row">${sw(ALPHA)}Alpha<br><span>8–13 cycles per second ${c('rhythm-alpha')}</span></th><td data-label="What it reflects">Often strongest with eyes closed. One proposed role is to help suppress distracting visual input ${c('alpha-function')}.</td><td data-label="What it is useful for">Studying visual attention and perception; detecting eye closure for a simple switch; estimating where attention is directed in experiments ${c('alpha-function')}${c('covert-attention')}.</td></tr>
          <tr><th scope="row">${sw(THETA)}Frontal theta<br><span>about 4–8 cycles per second ${c('rhythm-theta')}</span></th><td data-label="What it reflects">Often increases during demanding mental work and after errors. Shared timing between frontal regions may help us adjust after a mistake ${c('theta-function')}.</td><td data-label="What it is useful for">Studying responses to mistakes and estimating workload in defined tasks. Workload estimates and mental-task commands use combinations of EEG features in these studies ${c('theta-function')}${c('frontal-control')}.</td></tr>
          <tr><th scope="row">${sw(MU)}Mu and beta<br><span>movement</span></th><td data-label="What it reflects">The repeating voltage pattern over movement areas weakens during actual or imagined movement ${c('rhythm-mu')}${c('rhythm-beta')}.</td><td data-label="What it is useful for">Studying movement-related activity, or mapping imagined movements to cursor commands ${c('self-generated-signals')}.</td></tr>
          <tr><th scope="row">P300 response</th><td data-label="What it reflects">A brief voltage response to an uncommon event you are attending to ${c('evoked-map')}.</td><td data-label="What it is useful for">Studying attention, or picking a target letter by comparing responses across repeated flashes of different letter groups ${c('evoked-map')}.</td></tr>
          <tr><th scope="row">Response to flicker<br><span>steady-state visual evoked potential (SSVEP)</span></th><td data-label="What it reflects">Visual brain activity that repeats at a stimulus’s flicker rate ${c('evoked-map')}.</td><td data-label="What it is useful for">Measuring visual responses, or identifying a watched target among targets flickering at different rates ${c('evoked-map')}.</td></tr>
          <tr><th scope="row">${sw(SCP)}Slow cortical potentials</th><td data-label="What it reflects">Slow shifts in recorded voltage over seconds ${c('scp-control')}.</td><td data-label="What it is useful for">With an on-screen voltage display for feedback, some users learn to choose between letter groups until one letter remains ${c('scp-control')}.</td></tr>
        </tbody>
      </table>
      <p class="rhythm-model-note">Detecting a state is different from producing a reliable command on demand. These studies do not establish theta alone as a general-purpose control channel ${c('theta-function')}${c('frontal-control')}.</p>
    </section>
    <section class="rhythm-note">
      <h3>Telling rhythms apart</h3>
      <p>Alpha and mu can repeat at similar rates; their location and response to eye closure or movement help tell them apart ${c('rhythm-alpha')}${c('rhythm-mu')}${c('mu-vs-alpha')}.</p>
      <p class="rhythm-model-note">The later control demos give mu the same voltage amplitude as alpha. Since mu is usually weaker, this can make control look easier than it may be ${c('mu-vs-alpha')}.</p>
    </section>
    <section class="rhythm-note">
      <h3>Other uses of EEG</h3>
      <p>Clinicians use EEG to help evaluate seizures, and sleep studies use it to classify sleep stages ${c('eeg-clinical-uses')}.</p>
      <p>Researchers also study responses to mistakes. An error-related response can help an interface recognise that it made a wrong choice ${c('evoked-map')}.</p>
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
