/**
 * Extracellular potential of a single neuron modelled as a pair of point current sources in an
 * infinite homogeneous conductor (quasi-static). A synaptic current I enters the cell at the
 * synapse (an extracellular SINK, −I) and leaves through the membrane near the soma (a SOURCE, +I).
 * Point source: V = I / (4π σ r). Far from the pair (r ≫ d) the field is that of a current dipole
 * p = I·d:  V ≈ p cosθ / (4π σ r²).
 */

/** Potential (V) of a two-monopole "neuron" with separation d (m) centred at the origin, axis along z. */
export function twoMonopole(I: number, sigma: number, d: number, x: number, z: number): number {
  const rSink = Math.hypot(x, z - d / 2);
  const rSource = Math.hypot(x, z + d / 2);
  return (I / (4 * Math.PI * sigma)) * (1 / rSource - 1 / rSink);
}

/** Far-field (ideal dipole) potential of moment p (A·m) at distance r (m) and polar angle θ. */
export function dipole(p: number, sigma: number, r: number, theta: number): number {
  return (p * Math.cos(theta)) / (4 * Math.PI * sigma * r * r);
}

/** Point-source potential at distance r. */
export function monopole(I: number, sigma: number, r: number): number {
  return I / (4 * Math.PI * sigma * r);
}

/** Largest distance (m) from the nearer pole, along the axis, at which |V| of the two-monopole field still exceeds `threshold` (V). */
export function detectionRadius(I: number, sigma: number, d: number, threshold: number): number {
  // |V| decreases monotonically along the axis beyond the source; bisect on log r
  let lo = Math.log(1e-6), hi = Math.log(1); // search r from 1 µm to 1 m beyond the nearer pole
  const f = (lr: number) => Math.abs(twoMonopole(I, sigma, d, 0, d / 2 + Math.exp(lr))) - threshold;
  if (f(hi) > 0) return Infinity;
  if (f(lo) < 0) return 0;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (f(mid) > 0) lo = mid; else hi = mid;
  }
  return Math.exp((lo + hi) / 2);
}
