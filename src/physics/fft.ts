/** Minimal radix-2 FFT utilities for applying frequency-dependent transfer functions to sampled signals. */
import type { Complex } from './electrode';

function fftInPlace(re: Float64Array, im: Float64Array, inverse: boolean): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = ((inverse ? 2 : -2) * Math.PI) / len;
    const wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k, b = i + k + len / 2;
        const tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr; im[b] = im[a] - ti;
        re[a] += tr; im[a] += ti;
        const ncr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr; cr = ncr;
      }
    }
  }
  if (inverse) for (let i = 0; i < n; i++) { re[i] /= n; im[i] /= n; }
}

/** Filter a real signal with a frequency response H(f) (complex), f in Hz. DC is passed through H(0⁺). */
export function applyTransfer(x: Float64Array, fs: number, H: (f: number) => Complex): Float64Array {
  let n = 1;
  while (n < x.length) n <<= 1;
  const re = new Float64Array(n), im = new Float64Array(n);
  re.set(x);
  fftInPlace(re, im, false);
  for (let k = 0; k <= n / 2; k++) {
    const f = Math.max((k * fs) / n, 1e-3);
    const h = H(f);
    const r = re[k] * h.re - im[k] * h.im, i = re[k] * h.im + im[k] * h.re;
    re[k] = r; im[k] = i;
    if (k > 0 && k < n / 2) { re[n - k] = r; im[n - k] = -i; }
  }
  fftInPlace(re, im, true);
  return re.slice(0, x.length);
}
