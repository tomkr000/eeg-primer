/**
 * The model behind section 4: a real head (fsaverage, BioSemi-128 lead field), patches of synchronous cortex
 * placed on it, the scalp pattern of each, and the state (patches, source sliders) its controls drive.
 */
import { netDipole } from '../physics/population';
import { P } from '../data/params';
import { controls, slider, type Slider } from '../ui/slider';
import { sourceSliders } from './s07-noise';
import head from '../data/head-leadfield.json';

export interface Patch { center: number; radiusMm: number; name?: string; }
export const PATCH_COLORS = ['#2a78d6', '#eb6834', '#1baf7a', '#6250d6', '#eda100', '#e34948', '#008383', '#8a6d3b'];
export const patchColor = (i: number) => PATCH_COLORS[i % PATCH_COLORS.length];

function b64(s: string): ArrayBuffer {
  const bin = atob(s), u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return u8.buffer;
}
/** Decode the lead field (channels × sources, µV per nA·m): int16 values times one float32 scale per source. */
function decodeLeadfield(): Float32Array {
  const q = new Int16Array(b64(head.leadfield.int16_base64)), scale = new Float32Array(b64(head.leadfield.scale_float32_base64));
  const [nch, nsrc] = head.leadfield.shape;
  const L = new Float32Array(q.length);
  for (let ch = 0; ch < nch; ch++) for (let k = 0; k < nsrc; k++) L[ch * nsrc + k] = q[ch * nsrc + k] * scale[k];
  return L;
}
export const dist3 = (a: number[], b: number[]) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/** Least-squares sphere through a set of points: x² + y² + z² = 2ax + 2by + 2cz + d. */
function fitSphere(pts: number[][]): { center: number[]; R: number } {
  const M = Array.from({ length: 4 }, () => new Array(4).fill(0)), rhs = new Array(4).fill(0);
  for (const p of pts) {
    const row = [2 * p[0], 2 * p[1], 2 * p[2], 1], t = p[0] * p[0] + p[1] * p[1] + p[2] * p[2];
    for (let i = 0; i < 4; i++) { rhs[i] += row[i] * t; for (let j = 0; j < 4; j++) M[i][j] += row[i] * row[j]; }
  }
  const a = M.map((r, i) => [...r, rhs[i]]);
  for (let col = 0; col < 4; col++) {
    let piv = col; for (let r = col + 1; r < 4; r++) if (Math.abs(a[r][col]) > Math.abs(a[piv][col])) piv = r;
    [a[col], a[piv]] = [a[piv], a[col]];
    for (let r = col + 1; r < 4; r++) { const f = a[r][col] / a[col][col]; for (let k = col; k <= 4; k++) a[r][k] -= f * a[col][k]; }
  }
  const x = new Array(4).fill(0);
  for (let r = 3; r >= 0; r--) { let acc = a[r][4]; for (let k = r + 1; k < 4; k++) acc -= a[r][k] * x[k]; x[r] = acc / a[r][r]; }
  const center = [x[0], x[1], x[2]];
  return { center, R: Math.sqrt(x[3] + x[0] * x[0] + x[1] * x[1] + x[2] * x[2]) };
}

export const L = decodeLeadfield();
export const nCh = head.leadfield.shape[0], nSrc = head.leadfield.shape[1];
/** unit dipole direction of each source (the cortical normal), row-major n × 3 */
export const srcNn = new Float32Array(b64(head.sources.normal_float32_base64));
export const srcPos = head.sources.pos_mm as number[][];
export const elPos = head.electrodes.pos_mm as number[][];
// sphere fitted to the electrodes → center and radius for the top view; only what is above its center is drawn
export const { center, R } = fitSphere(elPos);
export const visible = (z: number) => z > 0;
const visEl = elPos.filter((p) => visible(p[2] - center[2]));
const xs = visEl.map((p) => p[0]), ys = visEl.map((p) => p[1]);
/** outline: an ellipse round the electrodes seen from above (head coordinates, mm) */
export const x0 = (Math.min(...xs) + Math.max(...xs)) / 2, y0 = (Math.min(...ys) + Math.max(...ys)) / 2;
export const ax = 1.03 * (Math.max(...xs) - Math.min(...xs)) / 2, by = 1.03 * (Math.max(...ys) - Math.min(...ys)) / 2;
export const inHead = (x: number, y: number) => ((x - x0) / ax) ** 2 + ((y - y0) / by) ** 2 <= 1;
/** interpolation kernel width for scalp maps: a bit under the mean electrode spacing */
export const sigmaMm = (() => { let nn = 0; for (let i = 0; i < nCh; i++) { let best = Infinity; for (let j = 0; j < nCh; j++) if (j !== i) best = Math.min(best, dist3(elPos[i], elPos[j])); nn += best; } return 0.8 * (nn / nCh); })();

/** Gaussian-weighted average of the electrode values at a scalp point (x, y) on the fitted sphere, in µV. */
export function scalpValue(values: ArrayLike<number>, x: number, y: number): number {
  const X = x - center[0], Y = y - center[1], Z = Math.sqrt(Math.max(0, R * R - X * X - Y * Y));
  const twoSig = 2 * sigmaMm * sigmaMm;
  let num = 0, den = 0;
  for (let e = 0; e < nCh; e++) { const ex = elPos[e][0] - x, ey = elPos[e][1] - y, ez = elPos[e][2] - center[2] - Z; const w = Math.exp(-(ex * ex + ey * ey + ez * ez) / twoSig); num += w * values[e]; den += w; }
  return den > 1e-12 ? num / den : 0;
}

// small scalp maps on a fixed grid over the outline, with the interpolation weights precomputed
export const G = 56;
export const miniW = new Float32Array(G * G * nCh), miniIn = new Uint8Array(G * G);
{
  const twoSig = 2 * sigmaMm * sigmaMm;
  for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) {
    const x = x0 + ((i + 0.5) / G - 0.5) * 2 * ax, y = y0 - ((j + 0.5) / G - 0.5) * 2 * by;
    if (!inHead(x, y)) continue;
    miniIn[j * G + i] = 1;
    const X = x - center[0], Y = y - center[1], Z = Math.sqrt(Math.max(0, R * R - X * X - Y * Y));
    let den = 0;
    for (let e = 0; e < nCh; e++) { const ex = elPos[e][0] - x, ey = elPos[e][1] - y, ez = elPos[e][2] - center[2] - Z; const w = Math.exp(-(ex * ex + ey * ey + ez * ez) / twoSig); miniW[(j * G + i) * nCh + e] = w; den += w; }
    for (let e = 0; e < nCh; e++) miniW[(j * G + i) * nCh + e] /= den || 1;
  }
}
/** values of a scalp pattern on the small grid, and its peak */
export function miniValues(a: ArrayLike<number>): { vals: Float32Array; vmax: number } {
  const vals = new Float32Array(G * G); let vmax = 1e-9;
  for (let g = 0; g < G * G; g++) { if (!miniIn[g]) continue; let v = 0; for (let e = 0; e < nCh; e++) v += miniW[g * nCh + e] * a[e]; vals[g] = v; vmax = Math.max(vmax, Math.abs(v)); }
  return { vals, vmax };
}
export const POS: [number, number, number] = [227, 73, 72], NEG: [number, number, number] = [42, 120, 214];

/** The patches of section 4 and the three slider values. */
export const state = { patches: [] as Patch[], N: P.patchDefaultN, f: P.patchDefaultSync, radiusMm: 10 };
const listeners: (() => void)[] = [];
export const subscribe = (fn: () => void) => { listeners.push(fn); };
export const notify = () => listeners.forEach((f) => f());

export const momentNam = () => netDipole(Math.round(state.N), state.f, 1, P.singleCellMomentPAm * 1e-12).total * 1e9;
export const nearestSource = (x: number, y: number, z: number) => { let best = 0, bd = Infinity; srcPos.forEach((p, i) => { const d = Math.hypot(p[0] - x, p[1] - y, p[2] - z); if (d < bd) { bd = d; best = i; } }); return best; };
export const at = (x: number, y: number, z: number, r?: number): Patch => ({ center: nearestSource(x, y, z), radiusMm: r ?? state.radiusMm });
/** motor areas in fsaverage head coordinates (mm), converted from approximate MNI coordinates with MNE (claim motor-map) */
export const MOTOR = (): Patch[] => [
  { ...at(-38.8, 9.6, 98.9, 10), name: 'right hand (left hemisphere)' }, { ...at(35.2, 9.3, 98.9, 10), name: 'left hand (right hemisphere)' }, { ...at(-1.9, 5.2, 113.2, 10), name: 'feet' },
  { ...at(-56.8, 25.3, 76.0, 10), name: 'tongue' }, { ...at(53.2, 25.0, 76.0, 10), name: 'tongue' },
  { ...at(-24.9, 3.0, 108.0, 10), name: 'right shoulder (left hemisphere)' }, // the hand patch moved by the shoulder's offset from the index finger in Grafton et al. (claim motor-map)
];

/** scalp pattern of a patch (µV at each electrode) and the cortical sources it covers */
/**
 * scalp pattern (µV at each electrode) of a patch of radius r about source c whose members share one moment per
 * cell and together form a coherent dipole of net moment Q along the mean cortical normal: equal moments q per
 * member with |q Σ nᵢ| = Q, the vector sum floored at a fifth of the member count so a patch on opposing sulcal
 * walls cannot demand an unbounded current
 */
export function coherentPattern(c: number, r: number, Q: number): { a: Float64Array; members: number[] } {
  const cpos = srcPos[c];
  const members: number[] = [];
  srcPos.forEach((q, i) => { if (dist3(q, cpos) <= r) members.push(i); });
  let nx = 0, ny = 0, nz = 0;
  for (const m of members) { nx += srcNn[m * 3]; ny += srcNn[m * 3 + 1]; nz += srcNn[m * 3 + 2]; }
  const net = Math.max(Math.hypot(nx, ny, nz), 0.2 * members.length);
  const a = new Float64Array(nCh), q = Q / net;
  for (const m of members) for (let ch = 0; ch < nCh; ch++) a[ch] += L[ch * nSrc + m] * q;
  return { a, members };
}
export const patchPattern = (p: Patch) => coherentPattern(p.center, p.radiusMm, momentNam());

/** The source sliders and the patch radius, bound to the shared state. */
export function dimControls(): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'dim-controls';
  const { sN, sF } = sourceSliders(state.N);
  const sRadius = slider({ label: 'Patch radius', unit: 'mm', min: 4, max: 30, value: state.radiusMm, step: 1 });
  const bind = (s: Slider, key: 'N' | 'f' | 'radiusMm') => {
    s.onChange((v) => { if (state[key] === v) return; state[key] = v; if (key === 'radiusMm') state.patches = state.patches.map((p) => ({ ...p, radiusMm: v })); notify(); });
    subscribe(() => { if (s.value !== state[key]) s.set(state[key]); });
  };
  bind(sN, 'N'); bind(sF, 'f'); bind(sRadius, 'radiusMm');
  wrap.append(controls(sN.el, sF.el, sRadius.el));
  return wrap;
}
