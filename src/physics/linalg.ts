/** Small dense linear-algebra helpers (symmetric eigenvalues by cyclic Jacobi; singular values from AᵀA). */

/** Eigenvalues of a symmetric n×n matrix (row-major Float64Array), descending. */
export function symmetricEigenvalues(a: Float64Array, n: number, sweeps = 12): number[] {
  const m = Float64Array.from(a);
  for (let sweep = 0; sweep < sweeps; sweep++) {
    let off = 0;
    for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) off += m[p * n + q] * m[p * n + q];
    if (off < 1e-24) break;
    for (let p = 0; p < n; p++) {
      for (let q = p + 1; q < n; q++) {
        const apq = m[p * n + q];
        if (Math.abs(apq) < 1e-300) continue;
        const app = m[p * n + p], aqq = m[q * n + q];
        const theta = (aqq - app) / (2 * apq);
        const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        const c = 1 / Math.sqrt(t * t + 1), s = t * c;
        for (let k = 0; k < n; k++) {
          const akp = m[k * n + p], akq = m[k * n + q];
          m[k * n + p] = c * akp - s * akq;
          m[k * n + q] = s * akp + c * akq;
        }
        for (let k = 0; k < n; k++) {
          const apk = m[p * n + k], aqk = m[q * n + k];
          m[p * n + k] = c * apk - s * aqk;
          m[q * n + k] = s * apk + c * aqk;
        }
      }
    }
  }
  const ev: number[] = [];
  for (let i = 0; i < n; i++) ev.push(m[i * n + i]);
  return ev.sort((x, y) => y - x);
}

/** Singular values of an m×k matrix given as k column vectors of length m (descending). */
export function singularValues(columns: Float64Array[]): number[] {
  const k = columns.length;
  if (k === 0) return [];
  const g = new Float64Array(k * k);
  for (let i = 0; i < k; i++) for (let j = i; j < k; j++) {
    let s = 0;
    const a = columns[i], b = columns[j];
    for (let r = 0; r < a.length; r++) s += a[r] * b[r];
    g[i * k + j] = s; g[j * k + i] = s;
  }
  return symmetricEigenvalues(g, k).map((v) => Math.sqrt(Math.max(v, 0)));
}

/** Eigenvalues (descending) and eigenvectors of a symmetric n×n matrix (row-major); column i of `vectors`
 * (vectors[k * n + i], k = 0..n−1) is the unit eigenvector of values[i]. Cyclic Jacobi. */
export function symmetricEigen(a: Float64Array, n: number, sweeps = 30): { values: number[]; vectors: Float64Array } {
  const m = Float64Array.from(a), v = new Float64Array(n * n);
  for (let i = 0; i < n; i++) v[i * n + i] = 1;
  for (let sweep = 0; sweep < sweeps; sweep++) {
    let off = 0, scale = 0;
    for (let p = 0; p < n; p++) { scale += m[p * n + p] * m[p * n + p]; for (let q = p + 1; q < n; q++) off += m[p * n + q] * m[p * n + q]; }
    if (off <= 1e-30 * Math.max(scale, 1e-300)) break;
    for (let p = 0; p < n; p++) {
      for (let q = p + 1; q < n; q++) {
        const apq = m[p * n + q];
        if (Math.abs(apq) < 1e-300) continue;
        const theta = (m[q * n + q] - m[p * n + p]) / (2 * apq);
        const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        const c = 1 / Math.sqrt(t * t + 1), s = t * c;
        for (let k = 0; k < n; k++) {
          const akp = m[k * n + p], akq = m[k * n + q];
          m[k * n + p] = c * akp - s * akq; m[k * n + q] = s * akp + c * akq;
        }
        for (let k = 0; k < n; k++) {
          const apk = m[p * n + k], aqk = m[q * n + k];
          m[p * n + k] = c * apk - s * aqk; m[q * n + k] = s * apk + c * aqk;
        }
        for (let k = 0; k < n; k++) {
          const vkp = v[k * n + p], vkq = v[k * n + q];
          v[k * n + p] = c * vkp - s * vkq; v[k * n + q] = s * vkp + c * vkq;
        }
      }
    }
  }
  const order = Array.from({ length: n }, (_, i) => i).sort((x, y) => m[y * n + y] - m[x * n + x]);
  const vectors = new Float64Array(n * n);
  for (let i = 0; i < n; i++) for (let k = 0; k < n; k++) vectors[k * n + i] = v[k * n + order[i]];
  return { values: order.map((i) => m[i * n + i]), vectors };
}
