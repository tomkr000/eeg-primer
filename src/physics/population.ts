/**
 * Summation of many neuronal current dipoles. Because the quasi-static field is linear, the net
 * far-field dipole is the vector sum of the individual dipoles. A fraction f of the N neurons is
 * taken to be synchronous and co-aligned (their moments add in phase, ∝ N); the remainder have
 * random phases, so their vector sum grows only as √N (a random walk).
 */
export interface PopulationResult {
  coherent: number; // A·m
  incoherent: number; // A·m (root-mean-square expectation)
  total: number; // A·m (coherent and incoherent parts are uncorrelated → add in quadrature)
}

export function netDipole(N: number, fSync: number, alignment: number, p: number): PopulationResult {
  const nSync = fSync * N;
  const coherent = p * nSync * alignment;
  const incoherent = p * Math.sqrt(Math.max(0, N - nSync));
  return { coherent, incoherent, total: Math.hypot(coherent, incoherent) };
}

/** Monte-Carlo illustration: amplitude of Σ cos(φ_i) for N unit phasors with phase spread. */
export function phasorSum(N: number, fSync: number, rng: () => number): number {
  let re = 0, im = 0;
  for (let i = 0; i < N; i++) {
    const phase = rng() < fSync ? 0 : rng() * 2 * Math.PI;
    re += Math.cos(phase);
    im += Math.sin(phase);
  }
  return Math.hypot(re, im);
}

/** Deterministic PRNG (mulberry32) so plots are reproducible. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
