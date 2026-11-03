import { claimCite as c } from '../data/params';
import { figure, inDepth } from '../ui/layout';

/** "How do neurons synchronize?": an aside with a schematic and a cited note, placed after section 4. */
export function mountSynchrony(root: HTMLElement) {
  const el = document.createElement('section');
  el.className = 'section question';
  el.id = 'synchrony';
  const body = document.createElement('div');
  body.className = 'section-note';
  el.append(inDepth(body, 'How do neurons synchronize?'));
  root.append(el);
  const fig = figure(body, '', { panelWidth: '0px' });
  fig.el.classList.add('figure-note');
  fig.viz.innerHTML = synchronySvg();
  fig.caption.innerHTML = `Three ways, often together. A shared rhythmic drive: the thalamus sends the same oscillation to many cortical cells, which is how the alpha rhythm is paced ${c('sync-thalamic')}. Shared inhibition: networks of inhibitory interneurons silence a population together and release it together, so its cells can only fire in the same brief window, the mechanism behind gamma oscillations ${c('sync-inhibition')}. Travelling waves: activity sweeps across the cortex, so neighbours fire a little after each other rather than exactly together; such waves cross the cortex at roughly 0.1 to 10 metres per second ${c('sync-waves')}. The bigger the pool recruited in each cycle, the slower the rhythm ${c('oscillations-synchrony')}.`;
}

/** Schematic of three synchronising mechanisms, as inline SVG. */
function synchronySvg(): string {
  const cell = (x: number, y: number, phase: number) => `<g transform="translate(${x},${y})"><path d="M0,0 L0,-26 M0,-26 l-9,-10 M0,-26 l9,-10 M0,-26 l0,-12" stroke="#1a1a1a" stroke-width="2" fill="none"/><path d="M0,-2 l-8,10 h16 z" fill="#fff" stroke="#1a1a1a" stroke-width="2"/><path d="M-14,34 q7,${-10 * Math.cos(phase)} 14,0 t14,0" stroke="#2a78d6" stroke-width="2" fill="none"/></g>`;
  const panel = (x: number, title: string, inner: string) => `<g transform="translate(${x},0)"><text x="0" y="18" font-size="14" font-weight="600" fill="#1a1a1a" font-family="system-ui, sans-serif">${title}</text>${inner}</g>`;
  const drive = panel(0, 'Shared rhythmic drive (alpha)', `
    <rect x="70" y="36" width="80" height="26" rx="6" fill="#fcfcfb" stroke="#1a1a1a" stroke-width="1.5"/>
    <text x="110" y="54" font-size="12" text-anchor="middle" fill="#1a1a1a" font-family="system-ui, sans-serif">thalamus</text>
    ${[40, 80, 120, 160].map((cx) => `<path d="M110,62 L${cx},92" stroke="#898781" stroke-width="1.5" fill="none" marker-end="url(#arr)"/>`).join('')}
    ${[40, 80, 120, 160].map((cx) => cell(cx, 130, 0)).join('')}`);
  const inhib = panel(230, 'Shared inhibition (gamma)', `
    <circle cx="110" cy="50" r="13" fill="#eb6834" stroke="#1a1a1a" stroke-width="1.5"/>
    <text x="110" y="54" font-size="11" text-anchor="middle" fill="#fff" font-family="system-ui, sans-serif">−</text>
    <text x="132" y="54" font-size="12" fill="#1a1a1a" font-family="system-ui, sans-serif">interneuron</text>
    ${[40, 80, 120, 160].map((cx) => `<path d="M110,63 L${cx},92" stroke="#eb6834" stroke-width="1.5" fill="none"/><circle cx="${cx}" cy="94" r="3" fill="#eb6834"/>`).join('')}
    ${[40, 80, 120, 160].map((cx) => cell(cx, 130, 0)).join('')}`);
  const wave = panel(460, 'Travelling wave', `
    <path d="M30,60 L200,60" stroke="#898781" stroke-width="1.5" marker-end="url(#arr)"/>
    <text x="115" y="52" font-size="12" text-anchor="middle" fill="#52514e" font-family="system-ui, sans-serif">0.1 to 10 m/s across the cortex</text>
    ${[40, 80, 120, 160].map((cx, i) => cell(cx, 130, i * 0.9)).join('')}`);
  return `<svg class="sync-svg" viewBox="0 0 690 175" width="690" height="175" role="img" aria-label="Three ways neurons synchronise"><defs><marker id="arr" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="#898781"/></marker></defs>${drive}${inhib}${wave}</svg>`;
}
