import { claimCite as c } from '../data/params';
import { section, sw } from '../ui/layout';
import { at, ax, by, patchColour, type Patch } from './dim-model';
import { drawCortex, headGeometry } from './head-view';

type Mode = 'reinforce' | 'drift' | 'cancel';
const INK = '#161616';

/** A schematic bridge from broad functional regions to local sources and their signed scalp sum. */
export function mountPatchRegions(root: HTMLElement) {
  const sec = section(root, 'patches', '5', 'Local patches combine into changing scalp voltages');
  sec.text.parentElement!.remove();
  const fig = document.createElement('figure');
  fig.className = 'patch-regions';
  fig.setAttribute('aria-label', 'Local patches within broad regions, and their voltage contributions at one electrode');
  fig.innerHTML = `
    <div class="patch-region-map">
      <div class="viz-title">Regions contain local patches</div>
      <canvas class="patch-region-head" width="640" height="700" role="img" aria-label="Head viewed from above. Three dashed broad regions each contain two smaller numbered cortical patches: frontal contains 3 and 4, movement contains 1 and 2, and visual contains 5 and 6. A separate ring E marks a scalp electrode. Locations and counts are schematic."></canvas>
      <p class="patch-region-key">${sw('#76756e', 'dash')}Broad region &nbsp; ${sw(patchColour(0), 'glow')}Numbered local patch<br><span class="patch-electrode-key" aria-hidden="true">E</span> Scalp electrode</p>
      <p class="patch-region-assumption">Locations and patch count are illustrative, not measured boundaries. ${c('patch-regions')}</p>
    </div>
    <div class="patch-region-signals">
      <div class="viz-title">Two patch contributions at one electrode</div>
      <div class="patch-mode-buttons" role="group" aria-label="Relationship between the two patch contributions">
        <button type="button" data-mode="reinforce" aria-pressed="true">Reinforce</button>
        <button type="button" data-mode="drift" aria-pressed="false">Timing drifts</button>
        <button type="button" data-mode="cancel" aria-pressed="false">Cancel</button>
      </div>
      <p class="patch-voltage-label">Voltage relative to reference <span>Same scale throughout</span></p>
      <div class="patch-contribution-traces"></div>
      <p class="patch-snapshot-note">Section 4 shows a snapshot. For one fixed oscillating patch, the ${sw('#e34948')}positive and ${sw('#2a78d6')}negative parts of its scalp map swap each half-cycle. Different patch timing can also change the combined map’s shape. ${c('rhythm-snapshot')}</p>
      <p class="patch-mode-explanation" aria-live="polite"></p>
      <p class="patch-region-assumption"><strong>Only patches 1 and 2 enter this sum.</strong> The two contributions are equally strong; other patches and noise are left out. ${c('patch-mix-demo')}${c('superposition')}</p>
    </div>
    <figcaption class="patch-region-answers">
      <p><strong>Inside a patch:</strong> cells need not be perfectly synchronized. Sections 2 and 4 vary the fraction in step. ${c('patch-regions')}</p>
      <p><strong>Between patches:</strong> neighbors can share some activity and differ in other activity. Being close does not mean being in step. ${c('patch-relations')}</p>
      <p><strong>Current direction matters too:</strong> even synchronized sources can partly cancel if their currents produce opposite voltage signs at the electrode. ${c('patch-cancellation')}</p>
    </figcaption>`;
  sec.fig.append(fig);
  drawRegionHead(fig.querySelector('canvas')!);

  const traces = fig.querySelector<HTMLElement>('.patch-contribution-traces')!;
  const labels = ['Patch 1: contribution at E', 'Patch 2: contribution at E', 'Sum at electrode E'];
  const colors = [patchColour(0), patchColour(1), INK];
  traces.innerHTML = labels.map((label, row) => `<div class="patch-trace-row">
    <div class="patch-trace-label">${sw(colors[row], 'line')}${label}</div>
    <div class="patch-trace-chart"><span class="patch-trace-zero-label" aria-hidden="true">0</span>
      <svg viewBox="0 0 480 64" preserveAspectRatio="none" role="img" aria-label="${label}">
        <line x1="1" y1="3" x2="1" y2="61" class="patch-trace-axis"/>
        <line x1="1" y1="32" x2="479" y2="32" class="patch-trace-zero"/>
        <path class="patch-trace-wave" fill="none" stroke="${colors[row]}" stroke-width="${row === 2 ? 2.6 : 2.3}" vector-effect="non-scaling-stroke"/>
      </svg>
    </div></div>`).join('') + '<p class="patch-trace-time">Time →</p>';
  const paths = [...traces.querySelectorAll<SVGPathElement>('.patch-trace-wave')];
  const modeNote = fig.querySelector<HTMLElement>('.patch-mode-explanation')!;
  const buttons = [...fig.querySelectorAll<HTMLButtonElement>('[data-mode]')];
  const descriptions: Record<Mode, string> = {
    reinforce: `<strong>Reinforce:</strong> the sources share timing and have the same voltage sign at E, so their contributions add. ${c('superposition')}`,
    drift: `<strong>Timing drifts:</strong> slightly different repetition rates change the relative timing. The contributions sometimes reinforce and sometimes oppose. ${c('patch-mix-demo')}`,
    cancel: `<strong>Cancel:</strong> one patch contributes positive voltage whenever the other contributes an equal negative voltage. This pair sums to zero at E, although both patches are active. ${c('patch-cancellation')}`,
  };
  const render = (mode: Mode) => {
    // Fixed dimensions, gains and voltage scale in every mode, with no normalization.
    const values: number[][] = [[], [], []];
    for (let i = 0; i <= 600; i++) {
      const t = i / 600;
      const first = Math.sin(2 * Math.PI * 5 * t);
      const second = mode === 'cancel' ? -first : mode === 'drift' ? Math.sin(2 * Math.PI * 5.75 * t) : first;
      values[0].push(first); values[1].push(second); values[2].push(first + second);
    }
    paths.forEach((path, row) => path.setAttribute('d', values[row].map((v, i) =>
      `${i ? 'L' : 'M'}${(1 + i / 600 * 478).toFixed(2)},${(32 - v * 14).toFixed(2)}`).join(' ')));
    buttons.forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.mode === mode)));
    modeNote.innerHTML = descriptions[mode];
  };
  buttons.forEach((button) => button.addEventListener('click', () => render(button.dataset.mode as Mode)));
  render('reinforce');
}

/** Use the same cortical cloud, outline and numbered patch glows as section 4. */
function drawRegionHead(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d')!;
  ctx.scale(2, 2);
  const geo = headGeometry(320, 350);
  const patches: Patch[] = [
    at(-38.8, 9.6, 98.9, 9), at(35.2, 9.3, 98.9, 9),
    at(-24, 58, 80, 9), at(24, 58, 80, 9),
    at(-26, -47, 78, 9), at(26, -47, 78, 9),
  ];
  const regions = [
    { label: 'Frontal', indices: [2, 3] },
    { label: 'Movement', indices: [0, 1] },
    { label: 'Visual', indices: [4, 5] },
  ].map(({ label, indices }) => {
    const a = geo.srcXY[patches[indices[0]].center], b = geo.srcXY[patches[indices[1]].center];
    return { label, x: (a[0] + b[0]) / 2, y: (a[1] + b[1]) / 2, rx: Math.abs(a[0] - b[0]) / 2 + 30, ry: Math.abs(a[1] - b[1]) / 2 + 31 };
  });
  drawCortex(ctx, { ...geo, grid: () => {
    ctx.save();
    regions.forEach((r) => {
      ctx.beginPath(); ctx.ellipse(r.x, r.y, r.rx, r.ry, 0, 0, 2 * Math.PI);
      ctx.fillStyle = 'rgba(118,117,110,0.08)'; ctx.fill();
    });
    ctx.restore();
  } }, patches);
  ctx.save();
  regions.forEach((r) => {
    ctx.beginPath(); ctx.ellipse(r.x, r.y, r.rx, r.ry, 0, 0, 2 * Math.PI);
    ctx.strokeStyle = '#fcfcfb'; ctx.lineWidth = 5; ctx.stroke();
    ctx.strokeStyle = '#52514e'; ctx.lineWidth = 2; ctx.setLineDash([6, 4]); ctx.stroke();
    ctx.setLineDash([]); ctx.font = '600 14px system-ui, sans-serif'; ctx.textAlign = 'center';
    const width = ctx.measureText(r.label).width;
    ctx.fillStyle = '#fcfcfb'; ctx.fillRect(r.x - width / 2 - 5, r.y - r.ry - 9, width + 10, 17);
    ctx.fillStyle = '#52514e'; ctx.fillText(r.label, r.x, r.y - r.ry + 4);
  });
  const ex = geo.cx + 0.88 * ax * geo.s, ey = geo.cy - 0.37 * by * geo.s;
  ctx.beginPath(); ctx.arc(ex, ey, 11, 0, 2 * Math.PI);
  ctx.fillStyle = '#fcfcfb'; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.stroke();
  ctx.font = 'bold 13px system-ui, sans-serif'; ctx.fillStyle = INK; ctx.fillText('E', ex, ey + 4.5);
  ctx.restore();
}
