import { claimCite as c } from '../data/params';
import { figure, inDepth, sw } from '../ui/layout';
import { MOTOR, ax, by } from './dim-model';
import { headGeometry, titledCanvas, drawCortex } from './head-view';

const ALPHA = '#2a78d6', MU = '#eb6834', THETA = '#1baf7a', MUSCLE = '#898781', SCP = '#6250d6', ATTN = '#eda100', EYES = '#8a6d3b';

/** "Which rhythms does the scalp see, and how do neurons synchronize?": an aside with a head map, a schematic and a cited note, placed after section 4. */
export function mountSynchrony(root: HTMLElement) {
  const el = document.createElement('section');
  el.className = 'section question';
  el.id = 'synchrony';
  const body = document.createElement('div');
  body.className = 'section-note';
  el.append(inDepth(body, 'Which rhythms does the scalp see, and how do neurons synchronize?'));
  root.append(el);
  const fig = figure(body, '', { panelWidth: '0px' });
  fig.el.classList.add('figure-note');
  const row = document.createElement('div');
  row.className = 'viz-row';
  fig.viz.append(row);
  const headBox = document.createElement('div');
  headBox.style.flex = '0 0 800px';
  const cv = titledCanvas(headBox, 'Sources of the scalp\u2019s signals, seen from above', 800, 360);
  drawRhythmMap(cv.getContext('2d')!);
  const schemBox = document.createElement('div');
  schemBox.className = 'viz-box'; schemBox.style.flex = '1 1 576px';
  schemBox.innerHTML = `<div class="viz-title">Three ways neurons synchronize</div>${synchronySvg()}`;
  row.append(headBox, schemBox);
  fig.caption.innerHTML = `<p><strong>Which rhythms.</strong> The scalp sees a handful of rhythms, each from its own region with its own switch.
The alpha rhythm (${sw(ALPHA)}), 8 to 13 Hz, comes from the back of the head, is largest with the eyes closed and fades with
attention ${c('rhythm-alpha')}. The mu rhythm (${sw(MU)}), 7 to 11 Hz with a partner near 20 Hz, sits over the sensorimotor
strip under electrodes C3, Cz and C4, ignores the eyes, and fades when the person moves, imagines moving or watches a movement
${c('rhythm-mu')}${c('rhythm-beta')}. Frontal midline theta (${sw(THETA)}), 4 to 8 Hz, appears just in front of the vertex during
problem solving and stress ${c('rhythm-theta')}. Gamma, above 30 Hz, barely reaches the scalp: under 1 µV from the brain against
about 100 µV of muscle (${sw(MUSCLE)}) at the temples, whose spectrum covers the whole gamma band, which is why scalp gamma is mostly
muscle ${c('gamma-scalp')}.
Mu and alpha share a band and are told apart by place and by what switches them; mu is usually the weaker of the two and is seen
by eye in only a minority of adults, so sections 7 to 9, which run the mu rhythm at the strength of section 5's alpha, take an
upper bound ${c('mu-vs-alpha')}.</p>
<p><strong>What a person can change at will.</strong> The sensorimotor rhythms, by imagining a movement, which is why they are the
control signal of sections 7 to 9; closing the eyes raises alpha and works as an on/off switch; the P300 and flicker responses need
a stimulus ${c('self-generated-signals')}. The front of the head adds more: frontal midline theta rises with mental effort, and
mental tasks that engage different areas, subtraction, word association, spatial navigation, give patterns a decoder can
tell apart, so a four-class interface built on them ran at 61 to 72% in 8 of 14 users, where motor imagery also sits
${c('frontal-control')}. At the vertex (${sw(SCP)}), slow shifts of the potential over seconds can be trained into a switch: locked-in
patients spelled with them, letter by letter through binary choices, after months of training ${c('scp-control')}, and the readiness potential, the slow negativity
that precedes a self-paced movement by about 2 s, announces an intention before the muscle moves ${c('readiness-potential')}. Over the
parietal lobe (${sw(ATTN)}), the pattern of alpha changes with where attention goes, eyes still, and a decoder reads the direction
at about 75% for the best pair ${c('covert-attention')}. All of these are band powers or slow shifts read over seconds, so they widen the menu of
section 7 without escaping its scatter limit. The two biggest signals at the front are not brain at all: blinks and eye movements
(${sw(EYES)}) at 100 to 200 µV ${c('blink-amplitude')} and the muscles, which is why frontal control signals need artefact rejection
that the sensorimotor strip does not.</p>
<p><strong>How neurons synchronize.</strong> Three ways, often together. A shared rhythmic drive: the thalamus sends the same oscillation
to many cortical cells, which is how the alpha rhythm is paced ${c('sync-thalamic')}. Shared inhibition: networks of inhibitory
interneurons silence a population together and release it together, so its cells can only fire in the same brief window, the
mechanism behind gamma oscillations ${c('sync-inhibition')}, and one that also shapes the 20 Hz sensorimotor rhythm ${c('rhythm-beta')}.
Travelling waves: activity sweeps across the cortex, so neighbours fire a little after each other rather than exactly together;
such waves cross the cortex at roughly 0.1 to 10 metres per second ${c('sync-waves')}. The bigger the pool recruited in each cycle,
the slower the rhythm ${c('oscillations-synchrony')}.</p>
<p><strong>Could a travelling wave be a control signal?</strong> Not from the scalp, so far. The waves that carry movement information
run within motor cortex at 15 to 35 cm/s, which at 20 Hz makes them about a centimetre long, an order of magnitude below the
10 cm or so over which the skull blurs neighbouring electrodes together; decoding from them has been proposed with implanted
arrays, and the only deliberate control of cortical waves so far is in mice. The waves EEG does see are the metres-per-second
kind, whose direction reverses between watching a stimulus and resting with the eyes closed ${c('waves-control')}.</p>`;
}

/** The head from above with the regions of the signals, labelled on both sides with leader lines. */
function drawRhythmMap(ctx: CanvasRenderingContext2D) {
  const LEFT = 240, HW = 300, geo = headGeometry(HW, 360), { cx, cy, s } = geo;
  ctx.translate(LEFT, 0); // head coordinates: the head spans x = 0 to HW, labels sit at x < 0 and x > HW
  drawCortex(ctx, geo, []);
  type Region = { x: number; y: number; rx: number; ry: number };
  const blob = (r: Region, color: string, alpha = 0.28) => {
    ctx.save(); ctx.globalAlpha = alpha; ctx.fillStyle = color;
    ctx.beginPath(); ctx.ellipse(r.x, r.y, r.rx * s, r.ry * s, 0, 0, 2 * Math.PI); ctx.fill();
    ctx.globalAlpha = 1; ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.stroke(); ctx.restore();
  };
  // regions (centre in px, half-axes in mm): the back of the head, the parieto-occipital band, the sensorimotor strip through the two hand areas of section 4, the vertex (the foot area), the midline just in front of the vertex, the temples, the eyes
  const motor = MOTOR(), at = (i: number) => geo.srcXY[motor[i].center];
  const alpha: Region = { x: cx, y: cy + 0.58 * by * s, rx: 0.46 * ax, ry: 0.26 * by };
  const attn: Region = { x: cx, y: cy + 0.24 * by * s, rx: 0.42 * ax, ry: 0.1 * by };
  const mu: Region = { x: (at(0)[0] + at(1)[0]) / 2, y: (at(0)[1] + at(1)[1]) / 2, rx: Math.abs(at(1)[0] - at(0)[0]) / (2 * s) + 16, ry: 16 };
  const vertex: Region = { x: at(2)[0], y: at(2)[1], rx: 8, ry: 8 };
  const theta: Region = { x: cx, y: cy - 0.4 * by * s, rx: 14, ry: 16 };
  const temple = (sgn: number): Region => ({ x: cx + sgn * 0.88 * ax * s, y: cy - 0.05 * by * s, rx: 10, ry: 24 });
  const eye = (sgn: number): Region => ({ x: cx + sgn * 0.3 * ax * s, y: cy - 0.82 * by * s, rx: 8, ry: 6 });
  blob(alpha, ALPHA); blob(attn, ATTN); blob(mu, MU); blob(theta, THETA);
  for (const sgn of [-1, 1]) { blob(temple(sgn), MUSCLE); blob(eye(sgn), EYES, 0.5); }
  blob(vertex, SCP, 0.55);
  geo.outline(ctx);
  // labels: a column on each side, each with a leader from the near edge of its region
  const label = (side: 'left' | 'right', y: number, color: string, title: string, lines: string[], r: Region) => {
    const right = side === 'right', lx = right ? HW + 22 : -22, tx = right ? lx + 16 : lx - 6;
    ctx.strokeStyle = color; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(r.x + (right ? 1 : -1) * r.rx * s, r.y); ctx.lineTo(right ? lx - 8 : lx + 18, y - 4); ctx.stroke();
    ctx.fillStyle = color; ctx.fillRect(right ? lx : lx - 10 + 10, y - 9, 10, 10);
    ctx.textAlign = right ? 'left' : 'right'; ctx.fillStyle = '#1a1a1a'; ctx.font = 'bold 13px system-ui, sans-serif'; ctx.fillText(title, tx, y);
    ctx.font = '12px system-ui, sans-serif'; ctx.fillStyle = '#52514e';
    lines.forEach((l, i) => ctx.fillText(l, tx, y + 16 + i * 13));
  };
  label('right', 28, THETA, 'frontal midline theta', ['4 to 8 Hz, just before the vertex;', 'raised at will by mental arithmetic', 'or word association: a BCI class'], theta);
  label('right', 96, MU, 'mu (with beta near 20 Hz)', ['7 to 11 Hz, under 50 \u00b5V, over', 'the sensorimotor strip (C3, Cz,', 'C4); fades with real, imagined', 'or observed movement; usually', 'weaker than alpha'], mu);
  label('right', 190, SCP, 'slow potentials at the vertex', ['months of feedback training make', 'a switch that spells, slowly; the', 'readiness potential shows a', 'move 2 s before it'], vertex);
  label('right', 272, ALPHA, 'alpha rhythm', ['8 to 13 Hz, under 50 \u00b5V, over', 'the back of the head; largest', 'with the eyes closed, fades', 'with attention'], alpha);
  label('left', 28, EYES, 'eyes', ['blinks and eye movements: 100 to', '200 \u00b5V at the front, bigger than', 'any rhythm'], eye(-1));
  label('left', 120, MUSCLE, 'muscle (jaw and temples)', ['about 100 \u00b5V, 20 to 300 Hz; the', 'brain\u2019s own gamma reaches the', 'scalp at under 1 \u00b5V'], temple(-1));
  label('left', 230, ATTN, 'parietal alpha (attention)', ['its pattern follows where attention', 'goes, eyes still; a decoder reads', 'the direction at about 75%'], attn);
  ctx.translate(-LEFT, 0);
}

/** Schematic of three synchronising mechanisms, as inline SVG. */
function synchronySvg(): string {
  const cell = (x: number, y: number, phase: number) => `<g transform="translate(${x},${y})"><path d="M0,0 L0,-26 M0,-26 l-9,-10 M0,-26 l9,-10 M0,-26 l0,-12" stroke="#1a1a1a" stroke-width="2" fill="none"/><path d="M0,-2 l-8,10 h16 z" fill="#fff" stroke="#1a1a1a" stroke-width="2"/><path d="M-14,34 q7,${-10 * Math.cos(phase)} 14,0 t14,0" stroke="#2a78d6" stroke-width="2" fill="none"/></g>`;
  const text = (x: number, y: number, t: string, size = 12, extra = 'fill="#52514e"') => `<text x="${x}" y="${y}" font-size="${size}" ${extra} font-family="system-ui, sans-serif">${t}</text>`;
  const panel = (x: number, title: string, sub: string, inner: string) => `<g transform="translate(${x},0)">${text(0, 16, title, 14, 'font-weight="600" fill="#1a1a1a"')}${text(0, 32, sub)}${inner}</g>`;
  const XS = [30, 70, 110, 150];
  const drive = panel(0, 'Shared rhythmic drive', 'paces the alpha rhythm', `
    <rect x="50" y="44" width="80" height="26" rx="6" fill="#fcfcfb" stroke="#1a1a1a" stroke-width="1.5"/>
    ${text(90, 62, 'thalamus', 12, 'text-anchor="middle" fill="#1a1a1a"')}
    ${XS.map((cx) => `<path d="M90,70 L${cx},100" stroke="#898781" stroke-width="1.5" fill="none" marker-end="url(#arr)"/>`).join('')}
    ${XS.map((cx) => cell(cx, 138, 0)).join('')}`);
  const inhib = panel(192, 'Shared inhibition', 'gamma, and the 20 Hz beta', `
    <circle cx="90" cy="57" r="13" fill="#eb6834" stroke="#1a1a1a" stroke-width="1.5"/>
    ${text(90, 61, '\u2212', 11, 'text-anchor="middle" fill="#fff"')}
    ${text(112, 61, 'interneuron', 12, 'fill="#1a1a1a"')}
    ${XS.map((cx) => `<path d="M90,70 L${cx},100" stroke="#eb6834" stroke-width="1.5" fill="none"/><circle cx="${cx}" cy="102" r="3" fill="#eb6834"/>`).join('')}
    ${XS.map((cx) => cell(cx, 138, 0)).join('')}`);
  const wave = panel(384, 'Travelling wave', '0.1 to 10 m/s across the cortex', `
    <path d="M20,60 L170,60" stroke="#898781" stroke-width="1.5" marker-end="url(#arr)"/>
    ${XS.map((cx, i) => cell(cx, 138, i * 0.9)).join('')}
    ${['in motor cortex they are about', '1 cm long, below the skull\u2019s blur:', 'no scalp control signal so far'].map((t, i) => text(90, 200 + 14 * i, t, 12, 'text-anchor="middle" fill="#52514e"')).join('')}`);
  return `<svg class="sync-svg" viewBox="0 0 576 236" width="576" height="236" role="img" aria-label="Three ways neurons synchronise"><defs><marker id="arr" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="#898781"/></marker></defs>${drive}${inhib}${wave}</svg>`;
}
