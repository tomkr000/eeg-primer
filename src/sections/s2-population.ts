import { netDipole, mulberry32 } from '../physics/population';
import { solveShells, surfacePotential } from '../physics/sphere';
import { controls, readout, slider, fmt } from '../ui/slider';
import { glow, drawNeuron, glowLegend, CANVAS_FONT } from '../ui/field';
import { P, claimCite as c, defaultHead } from '../data/params';
import { section, figure, prose, readouts, assumptions } from '../ui/layout';

export function mountPopulation(root: HTMLElement) {
  const sec = section(root, 'population', '2', 'Strength in numbers, but only in step');
  prose(sec.text, `
<p>Fields add linearly ${c('superposition')}, so a patch of N cells is louder than one. How much louder
depends on timing. If the cells’ synaptic currents rise and fall together, their dipoles add in phase
and the far field grows as N. If their timing is unrelated, variances add instead of amplitudes and the sum
grows only as √N ${c('variances-add')}. Geometry matters too: pyramidal cells stand in parallel,
perpendicular to the cortical surface, so their dipoles point the same way and form an open field that
survives at a distance; cells with dendrites in all directions form closed fields that cancel just outside
the cell ${c('open-closed')}. Slow synaptic currents overlap in time; millisecond spikes rarely do, so the
distant field is synaptic ${c('psp-dominate')}.</p>
<p>The numbers: one layer-5 pyramidal cell carries about ${P.singleCellMomentRange[0]}–${P.singleCellMomentRange[1]} pA·m
during a burst ${c('single-cell-moment')}; a source that is routinely measured from outside is about
10 nA·m, which takes ${fmt(P.cellsFor10nAm[0], 2)}–${fmt(P.cellsFor10nAm[1], 2)} synchronous cells
${c('cells-for-10nam')}. Cortex holds ${fmt(P.neuronsPerMm2, 3)} neurons per mm² ${c('neuron-density')},
so those cells fit under half a square millimetre. In practice scalp visibility needs an area: spikes from
under 6 cm² of cortex were never seen on the scalp, those from over 10 cm² usually were ${c('tao-area')}
${c('area-rule')}.</p>
<h3>Do supporting cells help?</h3>
<p>No. Glia carry current, but mainly as slow shifts below 0.1 Hz, outside the EEG band ${c('glia-slow')},
and they are not lined up into open fields. What does enlarge a source is more coherent current: dendritic
calcium spikes ${c('ca-spike-moment')}, rhythmic drive that synchronises large populations
${c('oscillations-synchrony')}, and inhibitory currents in active cells ${c('inhibitory-contrib')}. EEG sees
sources of any orientation with only modest differences (unlike MEG) ${c('orientation')}, so folding does not
hide much. Only coherent, aligned current counts.</p>`);

  const sN = slider({ label: 'Neurons in the patch, N', min: 1, max: 1e7, value: P.patchDefaultN, log: true, format: (v) => fmt(Math.round(v), 3) });
  const sF = slider({ label: 'Fraction firing in synchrony', min: 0, max: 1, step: 0.01, value: P.patchDefaultSync, note: c('variances-add') });
  const TH_UV = 1; // detection floor drawn as the dashed circle: the noise of a good scalp electrode (section 4)
  const rMoment = readout('Net dipole moment');
  const rReach = readout(`Reach: field above ${TH_UV} µV out to`, c('skin-noise'));
  const rArea = readout('Cortical area of the patch', c('neuron-density') + c('pyramidal-fraction'));
  const rScalp = readout('Peak scalp potential (section 3 head)');

  const fig = figure(sec.fig, 'Left: zoomed in on the patch; each glyph stands for many pyramidal cells and the glow is their summed field, red where positive, blue where negative. Cells firing out of step make a patchwork that cancels; cells in step merge into one large dipole. Right: zoomed out to 10 cm of cortex; the dashed circle is the reach of the patch: inside it the field is above 1 µV, the noise floor of a good electrode, so a sensor anywhere inside would register the patch and one outside would not. Fields are computed for the full three-dimensional patch, in uniform grey matter.');
  const row = document.createElement('div');
  row.className = 'viz-row';
  const left = document.createElement('div'), right = document.createElement('div');
  row.append(left, right);
  fig.viz.append(row);
  const zoomSpan = 1.6e-3; // ±1.6 mm
  const wideSpan = 50e-3; // ±50 mm
  const gz = glow(left, { width: 340, height: 360, scale: 2, xRange: [-zoomSpan, zoomSpan], yRange: [-zoomSpan * 1.06, zoomSpan * 1.06], floor: 1e-6, ceiling: 3e-2, grid: { step: 0.5e-3, factor: 1e3, unit: 'mm' } });
  const cap1 = document.createElement('div'); cap1.className = 'viz-caption'; cap1.textContent = 'Zoomed in: 3 mm of cortex';
  left.append(cap1);
  glowLegend(left, '1 µV', '30 mV');
  const gw = glow(right, { width: 340, height: 360, scale: 2, xRange: [-wideSpan, wideSpan], yRange: [-wideSpan * 1.06, wideSpan * 1.06], floor: 1e-7, ceiling: 1e-3, grid: { step: 1e-2, factor: 100, unit: 'cm' } });
  const cap2 = document.createElement('div'); cap2.className = 'viz-caption'; cap2.textContent = 'Zoomed out: 10 cm of cortex';
  right.append(cap2);
  glowLegend(right, '0.1 µV', '1 mV', 'dashed circle = reach (field above 1 µV, detectable inside)');
  fig.panel.append(controls(sN.el, sF.el), readouts(rMoment.el, rReach.el, rArea.el, rScalp.el));
  assumptions(fig.el, [
    { what: 'Per-cell source', value: `${P.singleCellMomentPAm} pA·m per cell (a layer-5 pyramidal cell during a burst), all cells aligned normal to the cortex`, cite: c('single-cell-moment') + c('open-closed') },
    { what: 'Summation', value: 'the synchronous fraction adds coherently (as N); the rest adds as a random walk (as √N) with random phases', cite: c('superposition') + c('variances-add') },
    { what: 'Reach', value: `distance on the axis at which the net dipole field falls to ${TH_UV} µV in uniform grey matter, the noise floor of a good scalp electrode`, cite: c('dipole') + c('skin-noise') },
    { what: 'Patch', value: 'a square of cortex sized by the cell density, modelled as 16 × 16 macro-dipoles', cite: c('neuron-density') + c('pyramidal-fraction') },
  ]);

  const head = defaultHead();
  const sol = solveShells(head.shells, head.sourceRadius, 1, 'radial', 120);
  const scalpPerAm = surfacePotential(sol, 0);
  const d = P.dipoleLengthUm * 1e-6;
  const sigma = P.sigmaGray;
  const densityPerM2 = P.neuronsPerMm2 * P.pyramidalFraction * 1e6; // pyramidal cells per m²

  function update() {
    const N = Math.round(sN.value), f = sF.value, p = P.singleCellMomentPAm * 1e-12, th = TH_UV * 1e-6;
    const W = Math.sqrt(N / densityPerM2); // side of the square patch, m
    const M = N === 1 ? 1 : 16; // macro-dipoles per side
    const n = N / (M * M); // cells per macro-dipole
    const rng = mulberry32(3);
    // amplitude of each macro-dipole in units of one cell's current: coherent n·f plus a random-walk √(n(1−f))
    const amps: number[] = [], xs: number[] = [], zs: number[] = [];
    for (let i = 0; i < M; i++) for (let j = 0; j < M; j++) {
      xs.push(M === 1 ? 0 : -W / 2 + ((i + 0.5) / M) * W);
      zs.push(M === 1 ? 0 : -W / 2 + ((j + 0.5) / M) * W);
      amps.push(n * f + Math.sqrt(n * (1 - f)) * Math.cos(rng() * 2 * Math.PI));
    }
    const Icell = p / d; // A per cell
    const k0 = Icell / (4 * Math.PI * sigma);
    const field = (x: number, y: number) => {
      let v = 0;
      for (let q = 0; q < amps.length; q++) {
        const dx = x - xs[q], dz = zs[q];
        const rSink = Math.sqrt(dx * dx + (y - d / 2) * (y - d / 2) + dz * dz);
        const rSrc = Math.sqrt(dx * dx + (y + d / 2) * (y + d / 2) + dz * dz);
        v += amps[q] * (1 / Math.max(rSrc, 1e-6) - 1 / Math.max(rSink, 1e-6));
      }
      return k0 * v;
    };
    const m = netDipole(N, f, 1, p).total;
    const reach = Math.sqrt(m / (4 * Math.PI * sigma * th));
    const spacing = 0.12e-3; // one glyph per 0.12 mm of patch width (a schematic: real cells are ~0.09 mm apart in three dimensions)
    gz.draw(field, (ctx, toPx) => {
      const half = Math.min(W / 2, zoomSpan);
      const count = N === 1 ? 1 : Math.max(1, Math.floor((2 * half) / spacing));
      for (let i = 0; i < count; i++) {
        const x = N === 1 ? 0 : -half + ((i + 0.5) / count) * 2 * half;
        drawNeuron(ctx, toPx, { x, soma: -d / 2, tuft: d / 2, lineWidth: 1.8, full: false });
      }
    });
    gw.draw(field, (ctx, toPx) => {
      // the patch as a bar at the cortex, and the cortical surface
      const [x0, y0] = toPx(-W / 2, d / 2), [x1, y1] = toPx(W / 2, -d / 2);
      ctx.fillStyle = 'rgba(26,26,26,0.85)';
      ctx.fillRect(Math.min(x0, x1), Math.min(y0, y1), Math.max(2, Math.abs(x1 - x0)), Math.max(2, Math.abs(y1 - y0)));
      ctx.fillStyle = '#1a1a1a'; ctx.font = CANVAS_FONT;
      ctx.fillText('patch', Math.max(x0, x1) + 5, (y0 + y1) / 2 + 5);
      // reach of the field: dashed circle of the on-axis detection distance
      const [cx, cy] = toPx(0, 0), [rx] = toPx(reach, 0);
      const rp = rx - cx;
      if (rp > 3) {
        ctx.save();
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 5; ctx.setLineDash([8, 6]);
        ctx.beginPath(); ctx.arc(cx, cy, rp, 0, 2 * Math.PI); ctx.stroke();
        ctx.strokeStyle = '#1a1a1a'; ctx.lineWidth = 2.2;
        ctx.beginPath(); ctx.arc(cx, cy, rp, 0, 2 * Math.PI); ctx.stroke();
        ctx.restore();
        const label = reach < 1e-3 ? `${fmt(reach * 1e6, 2)} µm` : reach < 1 ? `${fmt(reach * 1e3, 2)} mm` : `${fmt(reach, 2)} m`;
        const [lx, ly] = toPx(reach * 0.72, reach * 0.72);
        ctx.font = 'bold 14px system-ui, sans-serif';
        if (ly > 18 && lx < ctx.canvas.width - 120) ctx.fillText(`reach ${label}`, lx + 6, ly - 6);
        else ctx.fillText(`reach ${label}`, cx - 50, 24);
      }
    });
    rMoment.set(`${fmt(m * 1e9, 3)} nA·m`);
    rReach.set(reach < 1e-3 ? `${fmt(reach * 1e6, 3)} µm` : reach < 1 ? `${fmt(reach * 1e3, 3)} mm` : `${fmt(reach, 3)} m`);
    const areaMm2 = N / (P.neuronsPerMm2 * P.pyramidalFraction);
    rArea.set(areaMm2 < 100 ? `${fmt(areaMm2, 3)} mm²` : `${fmt(areaMm2 / 100, 3)} cm²`);
    rScalp.set(`${fmt(m * scalpPerAm * 1e6, 3)} µV`);
  }
  [sN, sF].forEach((s) => s.onChange(update));
  update();
}
