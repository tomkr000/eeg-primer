import { netDipole, mulberry32 } from '../physics/population';
import { solveShells, surfacePotential } from '../physics/sphere';
import { controls, readout, slider, fmt } from '../ui/slider';
import { glow, drawNeuron, drawCortexLayers, glowLegend, CANVAS_FONT } from '../ui/field';
import { P, claimCite as c, defaultHead } from '../data/params';
import { section, figure, prose, readouts, assumptions, sw, vizTitle } from '../ui/layout';

export function mountPopulation(root: HTMLElement) {
  const sec = section(root, 'population', '2', 'Many neurons must fire synchronously to create larger signal');
  // "How do neurons fall into step?": a heading above the figure, with the schematic and its note under a toggle
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
individual sources of any orientation ${c('orientation')}. When several sources are active together,
cortical folding can make their voltage contributions oppose and partly cancel ${c('patch-cancellation')}.
The measured sum depends on both the timing and direction of the currents ${c('superposition')}${c('variances-add')}.</p>`);

  const sN = slider({ label: 'Neurons in the patch, N', min: 1, max: P.patchMaxN, value: P.patchDefaultN, log: true, format: (v) => fmt(Math.round(v), 3), marks: [{ value: P.patchDefaultN, label: 'Typical source' }] });
  const sF = slider({ label: 'Fraction firing in synchrony', min: 0, max: 1, step: 0.01, value: P.patchDefaultSync, note: c('variances-add'), marks: [{ value: P.patchDefaultSync, label: 'Typical' }, { value: 1, label: 'Seizure' }] });
  const rMoment = readout('Net dipole moment');
  const rArea = readout('Cortical area of the patch', c('neuron-density') + c('pyramidal-fraction'));
  const rScalp = readout('Peak scalp potential (section 3 head)');

  const fig = figure(sec.fig, `A patch of pyramidal cells in the cortex, with the layers above it to scale as in section 1 (each grid square is 0.5 mm). Each glyph stands for many cells; the glow is their summed field (${sw('#e34948', 'glow')} positive, ${sw('#2a78d6', 'glow')} negative). Cells firing out of step make a patchwork that cancels; cells in step merge into one large dipole whose field spreads further. The field is drawn as if the layers above were grey matter; what the skull does to it is section 3. The carets mark typical values: 200,000 cells with a tenth in step make the 10 nA·m source that is typically measured from outside, and a seizure drives nearly all of them together.`);
  const W = 620, H = 400;
  const xr: [number, number] = [-5e-3, 5e-3], yr: [number, number] = [-1.2e-3, -1.2e-3 + 10e-3 * H / W];
  const surface = P.somaDepthMm * 1e-3, csf = P.thicknessCsfMm * 1e-3, dura = P.thicknessDuraMm * 1e-3;
  fig.viz.append(vizTitle('Summed potential of a patch of N pyramidal neurons (cortical cross-section)'));
  const gz = glow(fig.viz, { width: W, height: H, scale: 2, xRange: xr, yRange: yr, floor: 1e-7, ceiling: 1e-2, grid: { step: 0.5e-3, factor: 1e3, unit: 'mm', labelEvery: 2, note: 'each grid square = 0.5 mm' } });
  gz.canvas.style.width = `${W}px`;
  glowLegend(fig.viz, '0.1 µV', '10 mV');
  fig.panel.append(controls(sN.el, sF.el), readouts(rMoment.el, rArea.el, rScalp.el));
  assumptions(fig.el, [
    { what: 'Per-cell source', value: `${P.singleCellMomentPAm} pA·m per cell (a layer-5 pyramidal cell during a burst), all cells aligned normal to the cortex`, cite: c('single-cell-moment') + c('open-closed') },
    { what: 'Summation', value: 'the synchronous fraction adds coherently (as N); the rest adds as a random walk (as √N) with random phases', cite: c('superposition') + c('variances-add') },
    { what: 'Patch', value: 'a square of cortex sized by the cell density, modelled as 16 × 16 macro-dipoles; the field is computed as in uniform grey matter, with the layers drawn to scale for orientation (section 3 solves the layers properly)', cite: c('neuron-density') + c('pyramidal-fraction') + c('cortex-layers') },
    { what: 'Typical values', value: `${fmt(P.patchDefaultN, 3)} cells with a fraction ${P.patchDefaultSync} in step give ${fmt(P.patchDefaultN * P.patchDefaultSync * P.singleCellMomentPAm * 1e-3, 2)} nA·m, the typical measured source; the range of the N slider ends at ${fmt(P.patchMaxN, 2)} cells, about ${fmt(P.patchMaxN / (P.neuronsPerMm2 * P.pyramidalFraction) / 100, 2)} cm² of cortex`, cite: c('cells-for-10nam') + c('tao-area') },
  ]);

  const head = defaultHead();
  const sol = solveShells(head.shells, head.sourceRadius, 1, 'radial', 120);
  const scalpPerAm = surfacePotential(sol, 0);
  const d = P.dipoleLengthUm * 1e-6;
  const sigma = P.sigmaGray;
  const densityPerM2 = P.neuronsPerMm2 * P.pyramidalFraction * 1e6; // pyramidal cells per m²

  function update() {
    const N = Math.round(sN.value), f = sF.value, p = P.singleCellMomentPAm * 1e-12;
    const Wp = Math.sqrt(N / densityPerM2); // side of the square patch, m
    const M = N === 1 ? 1 : 16; // macro-dipoles per side
    const n = N / (M * M); // cells per macro-dipole
    const rng = mulberry32(3);
    // amplitude of each macro-dipole in units of one cell's current: coherent n·f plus a random-walk √(n(1−f))
    const amps: number[] = [], xs: number[] = [], zs: number[] = [];
    for (let i = 0; i < M; i++) for (let j = 0; j < M; j++) {
      xs.push(M === 1 ? 0 : -Wp / 2 + ((i + 0.5) / M) * Wp);
      zs.push(M === 1 ? 0 : -Wp / 2 + ((j + 0.5) / M) * Wp);
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
    const spacing = 0.12e-3; // one glyph per 0.12 mm of patch width (a schematic: real cells are ~0.09 mm apart in three dimensions)
    gz.draw(field, (ctx, toPx) => {
      drawCortexLayers(ctx, toPx, { xRange: xr, yTop: yr[1], surface, csf, dura });
      const half = Wp / 2;
      const count = N === 1 ? 1 : Math.min(40, Math.max(1, Math.floor((2 * half) / spacing)));
      for (let i = 0; i < count; i++) {
        const x = N === 1 ? 0 : -half + ((i + 0.5) / count) * 2 * half;
        drawNeuron(ctx, toPx, { x, soma: -d / 2, tuft: d / 2, lineWidth: 1.6, full: false });
      }
      ctx.save();
      ctx.font = CANVAS_FONT; ctx.fillStyle = '#1a1a1a'; ctx.textAlign = 'left';
      const [px, py] = toPx(half, -d / 2 - 0.25e-3);
      ctx.fillText(`patch: ${fmt(N, 3)} cells, ${Wp < 1e-3 ? `${fmt(Wp * 1e6, 2)} µm` : `${fmt(Wp * 1e3, 2)} mm`} across`, px + 10, py);
      ctx.restore();
    });
    rMoment.set(`${fmt(m * 1e9, 3)} nA·m`);
    const areaMm2 = N / (P.neuronsPerMm2 * P.pyramidalFraction);
    rArea.set(areaMm2 < 100 ? `${fmt(areaMm2, 3)} mm²` : `${fmt(areaMm2 / 100, 3)} cm²`);
    rScalp.set(`${fmt(m * scalpPerAm * 1e6, 3)} µV`);
  }
  [sN, sF].forEach((s) => s.onChange(update));
  update();

}
