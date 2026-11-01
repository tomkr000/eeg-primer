import { claimById } from './claims';
import { cite } from '../ui/cite';
import { stackShells, type Shell } from '../physics/sphere';

/**
 * Default parameter values used by the models. Each value is tied to a claim in claims.ts, which is
 * where the source and verification status live. Cite with claimCite('<claim id>').
 */
export const P = {
  sigmaGray: 0.33, // S/m — claim 'sigma-gray'
  sigmaCsf: 1.79, // S/m — 'sigma-csf'
  sigmaSkull: 0.015, // S/m — 'sigma-skull'
  sigmaScalp: 0.41, // S/m — 'sigma-scalp'
  sigmaDura: 0.06, // S/m — 'sigma-dura'
  thicknessSkullMm: 6.3, // 'thickness-skull'
  thicknessScalpMm: 5.5, // 'thickness-scalp'
  thicknessCsfMm: 1.0, // 'thickness-csf'
  thicknessDuraMm: 0.4, // 'thickness-dura'
  brainRadiusM: 0.08, // 'brain-radius'
  cellCurrentPa: 1000, // net current of one cell during a burst ≈ moment / length ('single-cell-moment', 'dipole-length'); a single synapse ~100 pA ('epsc')
  dipoleLengthUm: 500, // 'dipole-length'
  spikeNoiseUv: 5, // 'spike-noise-floor'
  singleCellMomentPAm: 0.5, // 'single-cell-moment'
  singleCellMomentRange: [0.41, 0.9] as [number, number],
  cellsFor10nAm: [10000, 50000] as [number, number], // 'cells-for-10nam'
  neuronsPerMm2: 147000, // 'neuron-density'
  pyramidalFraction: 0.8, // 'pyramidal-fraction'
  /** measured extracellular spike amplitude: ≥ 60 µV within 50 µm of the soma (Henze 2000) */
  henzeSpikePoints: [[50e-6, 60]] as [number, number][],
  henzeDetectionLimitM: 140e-6,
};

/** Citation marker for a claim: links to its references and shows the statement + status on hover. */
export function claimCite(id: string): string {
  const c = claimById.get(id);
  if (!c) { console.warn(`unknown claim id: ${id}`); return `<sup class="cite cite-missing">[?]</sup>`; }
  const marker = c.refs.length ? cite(...c.refs) : `<sup class="cite"><a href="#claim-${id}">[${c.status === 'derived' ? 'computed' : 'assumed'}]</a></sup>`;
  return `<span class="claim" data-claim="${id}" data-status="${c.status}">${marker}</span>`;
}

export function defaultHead(): { shells: Shell[]; sourceRadius: number } {
  const shells = stackShells(P.brainRadiusM, [
    { name: 'CSF', thickness: P.thicknessCsfMm * 1e-3, sigma: P.sigmaCsf },
    { name: 'dura', thickness: P.thicknessDuraMm * 1e-3, sigma: P.sigmaDura },
    { name: 'skull', thickness: P.thicknessSkullMm * 1e-3, sigma: P.sigmaSkull },
    { name: 'scalp', thickness: P.thicknessScalpMm * 1e-3, sigma: P.sigmaScalp },
  ], P.sigmaGray);
  return { shells, sourceRadius: P.brainRadiusM - 0.002 };
}
