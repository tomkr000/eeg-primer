import { describe, expect, it } from 'vitest';
import {
  exteriorPotential,
  freeSpaceDipole,
  legendreP,
  legendreP1,
  modalTransfer,
  potential,
  solveShells,
  stackShells,
  surfacePotential,
  type Shell,
} from '../src/physics/sphere';

const sigma = 0.33;
const R = 0.092;

/** Series form of the free-space dipole potential for r > b (what the solver assumes). */
function seriesFreeSpace(orientation: 'radial' | 'tangential', p: number, b: number, r: number, theta: number, phi: number, L = 200) {
  const ct = Math.cos(theta);
  const Y = orientation === 'radial' ? legendreP(ct, L) : legendreP1(ct, L);
  let v = 0;
  for (let l = 1; l <= L; l++) {
    const bp = ((orientation === 'radial' ? p * l : p) * Math.pow(b, l - 1)) / (4 * Math.PI * sigma);
    v += bp * Math.pow(r, -(l + 1)) * Y[l] * (orientation === 'radial' ? 1 : Math.cos(phi));
  }
  return v;
}

describe('Legendre expansions of the free-space dipole', () => {
  it.each(['radial', 'tangential'] as const)('%s dipole series matches the closed form for r > b', (orientation) => {
    const p = 1e-8, b = 0.03;
    const sol = solveShells([{ name: 'inf', outerRadius: 10, sigma }], b, p, orientation, 1);
    for (const [r, theta, phi] of [
      [0.05, 0.3, 0.7],
      [0.08, 1.2, 2.0],
      [0.045, 2.5, 0.1],
      [0.2, 0.9, 1.1],
    ]) {
      const st = Math.sin(theta);
      const exact = freeSpaceDipole(sol, r * st * Math.cos(phi), r * st * Math.sin(phi), r * Math.cos(theta));
      const series = seriesFreeSpace(orientation, p, b, r, theta, phi);
      expect(series).toBeCloseTo(exact, Math.max(6, -Math.log10(Math.abs(exact)) + 4));
    }
  });
});

describe('homogeneous sphere', () => {
  it('central radial dipole gives 3 p cosθ / (4π σ R²) on the surface', () => {
    const p = 1e-8;
    const sol = solveShells([{ name: 'brain', outerRadius: R, sigma }], 0, p, 'radial', 60);
    for (const theta of [0, 0.5, 1.3, 2.2, Math.PI]) {
      const expected = (3 * p * Math.cos(theta)) / (4 * Math.PI * sigma * R * R);
      expect(surfacePotential(sol, theta)).toBeCloseTo(expected, 12);
    }
  });
  it('central tangential dipole gives 3 p sinθ cosφ / (4π σ R²) on the surface', () => {
    const p = 1e-8;
    const sol = solveShells([{ name: 'brain', outerRadius: R, sigma }], 0, p, 'tangential', 60);
    for (const [theta, phi] of [[0.5, 0], [1.3, 1], [2.2, 2.5]]) {
      const expected = (3 * p * Math.sin(theta) * Math.cos(phi)) / (4 * Math.PI * sigma * R * R);
      expect(surfacePotential(sol, theta, phi)).toBeCloseTo(expected, 12);
    }
  });
  it('eccentric dipole: surface potential equals the known series (2l+1) b^(l-1) R^-(l+1) P_l', () => {
    const p = 1e-8, b = 0.07;
    const sol = solveShells([{ name: 'brain', outerRadius: R, sigma }], b, p, 'radial', 200);
    for (const theta of [0.1, 0.6, 1.5, 2.8]) {
      const P = legendreP(Math.cos(theta), 200);
      let s = 0;
      for (let l = 1; l <= 200; l++) s += (2 * l + 1) * Math.pow(b, l - 1) * Math.pow(R, -(l + 1)) * P[l];
      const expected = (p / (4 * Math.PI * sigma)) * s;
      expect(surfacePotential(sol, theta)).toBeCloseTo(expected, 10);
    }
  });
});

function fourShell(sigmaSkull = 0.01, csf = 1.79): Shell[] {
  return stackShells(
    0.080,
    [
      { name: 'csf', thickness: 0.002, sigma: csf },
      { name: 'skull', thickness: 0.006, sigma: sigmaSkull },
      { name: 'scalp', thickness: 0.005, sigma: 0.33 },
    ],
    0.33,
  );
}

describe('multi-shell solver', () => {
  it('reduces to the homogeneous sphere when all conductivities are equal', () => {
    const p = 1e-8, b = 0.075;
    const shells = fourShell(0.33, 0.33);
    const Rout = shells[shells.length - 1].outerRadius;
    const layered = solveShells(shells, b, p, 'radial', 150);
    const homo = solveShells([{ name: 'all', outerRadius: Rout, sigma: 0.33 }], b, p, 'radial', 150);
    for (const theta of [0, 0.3, 1.0, 2.0, 3.0]) {
      expect(surfacePotential(layered, theta)).toBeCloseTo(surfacePotential(homo, theta), 10);
    }
    // interior points across layers too
    for (const r of [0.081, 0.085, 0.09]) expect(potential(layered, r, 0.4)).toBeCloseTo(potential(homo, r, 0.4), 10);
  });

  it.each(['radial', 'tangential'] as const)('%s dipole: potential and radial current are continuous across every interface', (orientation) => {
    const p = 1e-8, b = 0.075;
    const shells = fourShell();
    const sol = solveShells(shells, b, p, orientation, 450); // the first interface is 5 mm from the source: terms decay as (b/r)^l
    const eps = 1e-9, h = 1e-7; // one-sided finite differences a hair inside/outside each interface
    const theta = 0.35, phi = 0.4;
    for (let n = 0; n < shells.length - 1; n++) {
      const r = shells[n].outerRadius;
      const vin = potential(sol, r - eps, theta, phi);
      const vout = potential(sol, r + eps, theta, phi);
      expect(Math.abs(vin - vout) / Math.abs(vin)).toBeLessThan(1e-6);
      const dIn = (potential(sol, r - eps, theta, phi) - potential(sol, r - eps - h, theta, phi)) / h;
      const dOut = (potential(sol, r + eps + h, theta, phi) - potential(sol, r + eps, theta, phi)) / h;
      const jin = shells[n].sigma * dIn, jout = shells[n + 1].sigma * dOut;
      // normalise by the natural current scale σ|V|/r: at the CSF/skull interface the radial current itself is ~100× smaller
      const scale = Math.max(Math.abs(jin), (shells[n].sigma * Math.abs(vin)) / r);
      expect(Math.abs(jin - jout) / scale).toBeLessThan(1e-4);
    }
    // zero radial current at the outer surface
    const Rout = shells[shells.length - 1].outerRadius;
    const dR = (potential(sol, Rout, theta, phi) - potential(sol, Rout - h, theta, phi)) / h;
    const scale = Math.abs(potential(sol, Rout, theta, phi)) / Rout;
    expect(Math.abs(dR) / scale).toBeLessThan(1e-4);
  });

  it('a resistive skull attenuates and broadens the scalp potential', () => {
    const p = 1e-8, b = 0.075;
    const withSkull = solveShells(fourShell(0.01), b, p, 'radial', 150);
    const noSkull = solveShells(fourShell(0.33), b, p, 'radial', 150);
    const peakWith = surfacePotential(withSkull, 0), peakWithout = surfacePotential(noSkull, 0);
    expect(peakWith).toBeLessThan(peakWithout * 0.5);
    // half-width: find θ where V drops to half the peak
    const halfWidth = (sol: ReturnType<typeof solveShells>) => {
      const peak = surfacePotential(sol, 0);
      for (let th = 0; th < Math.PI; th += 0.005) if (surfacePotential(sol, th) < peak / 2) return th;
      return Math.PI;
    };
    expect(halfWidth(withSkull)).toBeGreaterThan(halfWidth(noSkull) * 1.3);
  });

  it('modal transfer decays monotonically with degree for a skull-bearing head', () => {
    const sol = solveShells(fourShell(), 0.077, 1, 'radial', 80);
    const T = modalTransfer(sol);
    for (let l = 2; l <= 80; l++) expect(Math.abs(T[l])).toBeLessThan(Math.abs(T[l - 1]));
  });
});

describe('exterior (air) potential', () => {
  const shells: Shell[] = stackShells(0.08, [
    { name: 'CSF', thickness: 0.001, sigma: 1.79 },
    { name: 'skull', thickness: 0.0063, sigma: 0.015 },
    { name: 'scalp', thickness: 0.0055, sigma: 0.41 },
  ], sigma);
  const Rout = shells[shells.length - 1].outerRadius;
  it.each(['radial', 'tangential'] as const)('%s dipole: matches the scalp potential at the surface and decays outward', (orientation) => {
    const sol = solveShells(shells, 0.078, 1e-8, orientation, 300);
    for (const theta of [0.05, 0.3, 1.0]) {
      const inside = potential(sol, Rout - 1e-9, theta, 0.2);
      const outside = exteriorPotential(sol, Rout, theta, 0.2);
      expect(outside).toBeCloseTo(inside, 12);
    }
    // the peak over angle falls off with height above the scalp (a single angle can sit at a zero crossing)
    const peak = (r: number) => Math.max(...Array.from({ length: 180 }, (_, k) => Math.abs(exteriorPotential(sol, r, (k * Math.PI) / 180, 0.2))));
    expect(peak(Rout + 0.01)).toBeLessThan(peak(Rout));
    expect(peak(Rout + 0.03)).toBeLessThan(peak(Rout + 0.01));
    expect(exteriorPotential(sol, Rout - 0.001, 0.3)).toBeNaN();
  });
  it('an l = 1 scalp pattern decays exactly as (R/r)^2', () => {
    const sol = solveShells(shells, 0.078, 1e-8, 'radial', 1);
    const v0 = exteriorPotential(sol, Rout, 0.4), v1 = exteriorPotential(sol, 2 * Rout, 0.4);
    expect(v1 / v0).toBeCloseTo(0.25, 10);
  });
});
