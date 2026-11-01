/**
 * How many independent spatial patterns can be resolved from outside the head?
 *
 * Expand the cortical source (a sheet of radial dipoles at radius b) in spherical harmonics Y_lm.
 * The head is spherically symmetric, so each degree l is transmitted to the scalp with its own gain
 * T_l (see modalTransfer in sphere.ts) — the volume conductor is a spatial low-pass filter. If the
 * source spectrum is flat and a pattern counts as resolvable when its scalp amplitude exceeds the
 * noise floor, then only degrees l ≤ l_max survive, and the number of independent patterns is
 *   D = Σ_{l=1}^{l_max} (2l+1) = (l_max + 1)² − 1   (l = 0 is unobservable: potentials are relative).
 * With E electrodes you can in any case estimate at most E − 1 independent coefficients.
 */
import { modalTransfer, solveShells, type Shell } from './sphere';

export interface DimensionalityInput {
  shells: Shell[];
  /** source sheet radius, m */
  b: number;
  /** scalp amplitude of the l = 1 pattern, µV (sets the source strength) */
  scalpUvAtL1: number;
  /** noise floor per pattern, µV */
  noiseUv: number;
  /** number of electrodes */
  electrodes: number;
  /** radius of the sensing surface, m (default: outer surface of the head) */
  sensorRadius?: number;
  /** source-sheet amplitude (A·m/m² per unit harmonic coefficient); overrides scalpUvAtL1 when given */
  sourceScale?: number;
  L?: number;
}

export interface DimensionalityResult {
  l: number[];
  /** scalp amplitude per unit-degree pattern, µV */
  amplitudeUv: number[];
  lMax: number;
  modesBySnr: number;
  modesByElectrodes: number;
  modes: number;
  /** half-wavelength of the finest resolvable pattern at the sensing surface, m */
  resolutionM: number;
  /** the source amplitude actually used */
  sourceScale: number;
}

export function dimensionality(inp: DimensionalityInput): DimensionalityResult {
  const L = inp.L ?? 120;
  const sol = solveShells(inp.shells, inp.b, 1, 'radial', L);
  const T = modalTransfer(sol, inp.sensorRadius);
  const scale = inp.sourceScale ?? inp.scalpUvAtL1 / Math.abs(T[1]);
  const l: number[] = [], amplitudeUv: number[] = [];
  let lMax = 0;
  for (let k = 1; k <= L; k++) {
    const a = Math.abs(T[k]) * scale;
    l.push(k);
    amplitudeUv.push(a);
    if (a >= inp.noiseUv && lMax === k - 1) lMax = k;
  }
  const modesBySnr = (lMax + 1) * (lMax + 1) - 1;
  const modesByElectrodes = Math.max(0, inp.electrodes - 1);
  const R = inp.sensorRadius ?? inp.shells[inp.shells.length - 1].outerRadius;
  return {
    l,
    amplitudeUv,
    lMax,
    modesBySnr,
    modesByElectrodes,
    modes: Math.min(modesBySnr, modesByElectrodes),
    resolutionM: lMax > 0 ? (Math.PI * R) / lMax : Infinity,
    sourceScale: scale,
  };
}
