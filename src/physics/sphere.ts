/**
 * Quasi-static potential of a current dipole inside a set of concentric spherical shells
 * (brain / CSF / dura / skull / scalp …) with piecewise-constant conductivity.
 *
 * Method: expand the potential in each shell in Legendre functions,
 *   Φ_n(r,θ,φ) = Σ_l [ A_n r^l + B_n r^-(l+1) ] Y_l(θ,φ),
 * impose continuity of Φ and of radial current density σ ∂Φ/∂r at every interface and
 * zero radial current at the outer surface, and solve the resulting small linear system
 * once per degree l. This is the classical multi-shell solution (Rush & Driscoll 1969;
 * de Munck & Peters 1993; Zhang 1995; Nunez & Srinivasan 2006, App. G).
 *
 * The innermost shell contains the dipole. Its potential is written as the exact free-space
 * dipole potential plus a regular series Σ A_1 r^l Y_l; the free-space part is expanded,
 * for r > b, as Σ Bp_l r^-(l+1) Y_l with
 *   radial dipole:      Bp_l = p · l · b^(l-1) / (4πσ_1),   Y_l = P_l(cosθ)
 *   tangential dipole:  Bp_l = p · b^(l-1) / (4πσ_1),       Y_l = P_l^1(cosθ) cosφ
 * (Legendre / associated Legendre without the Condon–Shortley phase).
 *
 * Unknowns are scaled to the value of each term at the shell's own outer radius, which keeps the
 * system usable for the thousands of terms needed close to the first interface.
 */

export interface Shell {
  name: string;
  /** outer radius of this shell, meters (ascending) */
  outerRadius: number;
  /** conductivity, S/m */
  sigma: number;
}

export type DipoleOrientation = 'radial' | 'tangential';

export interface ShellSolution {
  shells: Shell[];
  b: number;
  moment: number;
  orientation: DipoleOrientation;
  L: number;
  /** per degree l (index l), per shell n: scaled coefficients Ã_n(l), B̃_n(l) */
  A: Float64Array[]; // A[n][l]
  B: Float64Array[]; // B[n][l]  (B[0] is the scaled primary coefficient B̃p in shell 0)
}

/** Solve a small dense system by Gaussian elimination with partial pivoting. */
function solveLinear(M: number[][], rhs: number[]): number[] {
  const n = rhs.length;
  const a = M.map((row, i) => [...row, rhs[i]]);
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(a[r][c]) > Math.abs(a[piv][c])) piv = r;
    [a[c], a[piv]] = [a[piv], a[c]];
    const d = a[c][c];
    if (d === 0) throw new Error('singular system');
    for (let r = c + 1; r < n; r++) {
      const f = a[r][c] / d;
      if (f === 0) continue;
      for (let k = c; k <= n; k++) a[r][k] -= f * a[c][k];
    }
  }
  const x = new Array(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let s = a[r][n];
    for (let k = r + 1; k < n; k++) s -= a[r][k] * x[k];
    x[r] = s / a[r][r];
  }
  return x;
}

export function solveShells(
  shells: Shell[],
  b: number,
  moment: number,
  orientation: DipoleOrientation,
  L = 120,
): ShellSolution {
  const N = shells.length;
  if (N < 1) throw new Error('need at least one shell');
  if (!(b >= 0 && b < shells[0].outerRadius)) throw new Error('dipole must lie inside the innermost shell');
  for (let n = 1; n < N; n++) if (shells[n].outerRadius <= shells[n - 1].outerRadius) throw new Error('radii must ascend');
  const r = shells.map((s) => s.outerRadius);
  const sg = shells.map((s) => s.sigma);
  const A = Array.from({ length: N }, () => new Float64Array(L + 1));
  const B = Array.from({ length: N }, () => new Float64Array(L + 1));

  for (let l = 1; l <= L; l++) {
    // primary coefficient, scaled to its value at r_0 (outer radius of innermost shell)
    // B̃p = p·[l]·b^(l-1)·r_0^-(l+1) / (4πσ_0), computed as (b/r_0)^(l-1) / r_0² to avoid overflow at large l
    const Bp = ((orientation === 'radial' ? moment * l : moment) * Math.pow(b / r[0], l - 1)) / (4 * Math.PI * sg[0] * r[0] * r[0]);
    B[0][l] = Bp;
    if (N === 1) {
      // outer boundary: σ ∂Φ/∂r = 0  →  l Ã − (l+1) B̃p = 0
      A[0][l] = ((l + 1) / l) * Bp;
      continue;
    }
    // unknowns: x[0]=Ã_0 ; x[2n-1]=Ã_n, x[2n]=B̃_n for n=1..N-1  (size 2N-1)
    const size = 2 * N - 1;
    const M: number[][] = Array.from({ length: size }, () => new Array(size).fill(0));
    const rhs = new Array(size).fill(0);
    let row = 0;
    for (let n = 0; n < N - 1; n++) {
      const R = r[n]; // interface radius
      // potential continuity: Φ_n(R) = Φ_{n+1}(R)
      // shell n at its own outer radius: Ã_n + B̃_n (+ B̃p if n = 0)
      // shell n+1 at its inner radius R: Ã_{n+1} (R/r_{n+1})^l + B̃_{n+1} (r_{n+1}/R)^(l+1)
      const ratioA = Math.pow(R / r[n + 1], l);
      const ratioB = Math.pow(r[n + 1] / R, l + 1);
      const iA_n = n === 0 ? 0 : 2 * n - 1;
      const iB_n = n === 0 ? -1 : 2 * n;
      const iA_n1 = 2 * (n + 1) - 1;
      const iB_n1 = 2 * (n + 1);
      M[row][iA_n] += 1;
      if (iB_n >= 0) M[row][iB_n] += 1;
      M[row][iA_n1] -= ratioA;
      M[row][iB_n1] -= ratioB;
      rhs[row] = n === 0 ? -Bp : 0;
      row++;
      // current continuity: σ_n ∂Φ_n = σ_{n+1} ∂Φ_{n+1}  (common factor 1/R dropped)
      // ∂r [Ã (r/r_n)^l] = (l/r) Ã (r/r_n)^l ; ∂r [B̃ (r_n/r)^(l+1)] = -((l+1)/r) B̃ (r_n/r)^(l+1)
      M[row][iA_n] += sg[n] * l;
      if (iB_n >= 0) M[row][iB_n] -= sg[n] * (l + 1);
      M[row][iA_n1] -= sg[n + 1] * l * ratioA;
      M[row][iB_n1] += sg[n + 1] * (l + 1) * ratioB;
      rhs[row] = n === 0 ? sg[0] * (l + 1) * Bp : 0;
      row++;
    }
    // outer surface of shell N-1: l Ã − (l+1) B̃ = 0
    M[row][2 * (N - 1) - 1] = l;
    M[row][2 * (N - 1)] = -(l + 1);
    rhs[row] = 0;
    const x = solveLinear(M, rhs);
    A[0][l] = x[0];
    for (let n = 1; n < N; n++) {
      A[n][l] = x[2 * n - 1];
      B[n][l] = x[2 * n];
    }
  }
  return { shells, b, moment, orientation, L, A, B };
}

/** Resolve the near-interface field, whose slowest terms decay as (b / brainRadius)^l.
 * 1e-15 geometric decay leaves room for the polynomial-in-degree dipole and angular factors.
 * This is a convergence choice for the site's positive-conductivity shells, not an error bound for
 * arbitrary layer contrasts. Regression tests compare the shallowest source with a longer expansion.
 */
function fieldDegree(ratio: number): number {
  return ratio > 0 ? Math.max(1, Math.ceil(Math.log(1e-15) / Math.log(ratio))) : 1;
}

export function solveShellsConverged(shells: Shell[], b: number, moment: number, orientation: DipoleOrientation): ShellSolution {
  return solveShells(shells, b, moment, orientation, Math.max(120, fieldDegree(b / shells[0].outerRadius)));
}

/** Legendre P_l(x) for l = 0..L */
export function legendreP(x: number, L: number): Float64Array {
  const P = new Float64Array(L + 1);
  P[0] = 1;
  if (L >= 1) P[1] = x;
  for (let l = 1; l < L; l++) P[l + 1] = ((2 * l + 1) * x * P[l] - l * P[l - 1]) / (l + 1);
  return P;
}

/** Associated Legendre P_l^1(x) (no Condon–Shortley phase) for l = 0..L */
export function legendreP1(x: number, L: number): Float64Array {
  const P = new Float64Array(L + 1);
  const s = Math.sqrt(Math.max(0, 1 - x * x));
  if (L >= 1) P[1] = s;
  if (L >= 2) P[2] = 3 * x * s;
  for (let l = 3; l <= L; l++) P[l] = ((2 * l - 1) * x * P[l - 1] - l * P[l - 2]) / (l - 1);
  return P;
}

function angular(sol: ShellSolution, cosTheta: number, phi: number, L = sol.L): Float64Array {
  if (sol.orientation === 'radial') return legendreP(cosTheta, L);
  const P1 = legendreP1(cosTheta, L);
  const c = Math.cos(phi);
  for (let l = 0; l <= L; l++) P1[l] *= c;
  return P1;
}

/** Exact free-space potential of the dipole (innermost conductivity) at Cartesian point (x,y,z), dipole at (0,0,b). */
export function freeSpaceDipole(sol: ShellSolution, x: number, y: number, z: number): number {
  const dx = x, dy = y, dz = z - sol.b;
  const d = Math.hypot(dx, dy, dz);
  if (d === 0) return NaN;
  const px = sol.orientation === 'radial' ? 0 : sol.moment;
  const pz = sol.orientation === 'radial' ? sol.moment : 0;
  return (px * dx + pz * dz) / (4 * Math.PI * sol.shells[0].sigma * d * d * d);
}

/** Which shell index contains radius r (outside the head → -1). */
export function shellIndex(sol: ShellSolution, r: number): number {
  for (let n = 0; n < sol.shells.length; n++) if (r <= sol.shells[n].outerRadius) return n;
  return -1;
}

/** Potential (volts) at spherical point (r, θ, φ). Returns NaN outside the head. */
export function potential(sol: ShellSolution, r: number, theta: number, phi = 0): number {
  const n = shellIndex(sol, r);
  if (n < 0) return NaN;
  const ct = Math.cos(theta);
  const rn = sol.shells[n].outerRadius;
  // Far from the first boundary the radial factors converge much faster. Avoid evaluating thousands
  // of negligible terms at every map pixel while using the same converged solution for map/readouts.
  const r0 = sol.shells[0].outerRadius;
  const L = Math.min(sol.L, fieldDegree(n === 0 ? sol.b * r / (r0 * r0) : sol.b / r));
  const Y = angular(sol, ct, phi, L);
  let v = 0;
  const A = sol.A[n], B = sol.B[n];
  if (n === 0) {
    const st = Math.sin(theta);
    v += freeSpaceDipole(sol, r * st * Math.cos(phi), r * st * Math.sin(phi), r * ct);
    const ratio = r / rn;
    let power = ratio;
    for (let l = 1; l <= L; l++, power *= ratio) v += A[l] * power * Y[l];
    return v;
  }
  const ra = r / rn, rb = rn / r;
  let pa = ra, pb = rb * rb;
  for (let l = 1; l <= L; l++, pa *= ra, pb *= rb) v += (A[l] * pa + B[l] * pb) * Y[l];
  return v;
}

/**
 * Potential (volts) in the air outside the head at spherical point (r > R, θ, φ). Air is treated as a perfect
 * insulator, so no current leaves the head and the interior solution is unchanged; the exterior potential
 * is the solution of Laplace's equation that matches the scalp potential at r = R and vanishes at infinity,
 * which per degree is the scalp coefficient times (R/r)^(l+1) (Jackson 1999, sect. 3.3). Returns NaN inside.
 */
export function exteriorPotential(sol: ShellSolution, r: number, theta: number, phi = 0): number {
  const n = sol.shells.length - 1;
  const R = sol.shells[n].outerRadius;
  if (r < R) return NaN;
  const L = Math.min(sol.L, fieldDegree(sol.b / r));
  const Y = angular(sol, Math.cos(theta), phi, L);
  let v = 0, power = (R / r) ** 2;
  for (let l = 1; l <= L; l++, power *= R / r) v += (sol.A[n][l] + sol.B[n][l]) * power * Y[l];
  return v;
}

/** Potential on the outer surface as a function of polar angle (and φ for tangential dipoles). */
export function surfacePotential(sol: ShellSolution, theta: number, phi = 0): number {
  const N = sol.shells.length;
  return potential(sol, sol.shells[N - 1].outerRadius, theta, phi);
}

/**
 * Per-degree transfer coefficient T_l from a radial dipole-sheet density on the sphere r = b
 * (A·m per m²) to the potential (V) on the sphere of radius `r` (default: the outer surface), for a unit
 * coefficient of Y_lm. By the addition theorem, T_l = c_l · 4π b² / (2l+1) where c_l is the l-th
 * coefficient at radius r produced by a unit point dipole at the pole.
 */
export function modalTransfer(sol: ShellSolution, r?: number): Float64Array {
  const N = sol.shells.length;
  const rr = r ?? sol.shells[N - 1].outerRadius;
  const n = shellIndex(sol, rr);
  if (n < 0 || rr <= sol.b) throw new Error('sensor radius must lie between the source and the outer surface');
  const rn = sol.shells[n].outerRadius;
  const T = new Float64Array(sol.L + 1);
  for (let l = 1; l <= sol.L; l++) {
    // coefficient of Y_l at radius rr; in the innermost shell the stored B[0] is the primary term
    const cl = (sol.A[n][l] * Math.pow(rr / rn, l) + sol.B[n][l] * Math.pow(rn / rr, l + 1)) / sol.moment;
    T[l] = (cl * 4 * Math.PI * sol.b * sol.b) / (2 * l + 1);
  }
  return T;
}

/** Convenience: build shells from thicknesses (m) stacked outward from a brain radius (m). */
export function stackShells(brainRadius: number, layers: { name: string; thickness: number; sigma: number }[], brainSigma: number): Shell[] {
  const shells: Shell[] = [{ name: 'brain', outerRadius: brainRadius, sigma: brainSigma }];
  let r = brainRadius;
  for (const L of layers) {
    if (L.thickness <= 0) continue;
    r += L.thickness;
    shells.push({ name: L.name, outerRadius: r, sigma: L.sigma });
  }
  return shells;
}
