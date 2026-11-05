export interface SliderOpts {
  label: string;
  unit?: string;
  min: number;
  max: number;
  step?: number;
  value: number;
  /** logarithmic slider (min and max must be > 0) */
  log?: boolean;
  /** formatted value display; default uses 3 significant figures */
  format?: (v: number) => string;
  /** HTML appended after the label (e.g. citation markers) */
  note?: string;
  /** reference points drawn as carets under the track, e.g. the typical value; align overrides the automatic placement */
  marks?: { value: number; label: string; align?: 'start' | 'end' | 'center'; row?: number }[];
  /** approximate track width in px, for placing the mark labels (default: one column of a two-column panel) */
  trackPx?: number;
}

export interface Slider {
  el: HTMLElement;
  value: number;
  onChange(fn: (v: number) => void): void;
  set(v: number): void;
}

export function fmt(v: number, digits = 3): string {
  if (!isFinite(v)) return '∞';
  if (v === 0) return '0';
  const a = Math.abs(v);
  if (a >= 1e7 || a < 1e-3) return v.toExponential(digits - 1).replace('e+', 'e');
  return Number(v.toPrecision(digits)).toLocaleString('en-US', { maximumFractionDigits: 6 });
}

/** Format with an SI prefix, e.g. fmtSI(3.07e5, 'Ω') → "307 kΩ". */
export function fmtSI(v: number, unit: string, digits = 3): string {
  if (!isFinite(v)) return '∞ ' + unit;
  if (v === 0) return '0 ' + unit;
  const prefixes: [number, string][] = [[1e12, 'T'], [1e9, 'G'], [1e6, 'M'], [1e3, 'k'], [1, ''], [1e-3, 'm'], [1e-6, 'µ'], [1e-9, 'n'], [1e-12, 'p'], [1e-15, 'f']];
  const a = Math.abs(v);
  for (const [scale, pre] of prefixes) if (a >= scale * 0.9995) return `${Number((v / scale).toPrecision(digits))} ${pre}${unit}`;
  return `${v.toExponential(digits - 1)} ${unit}`;
}

export function slider(o: SliderOpts): Slider {
  const el = document.createElement('label');
  el.className = 'slider';
  const name = document.createElement('div');
  name.className = 'slider-label';
  name.innerHTML = o.label + (o.note ? ' ' + o.note : '');
  const out = document.createElement('output');
  const input = document.createElement('input');
  input.type = 'range';
  const toPos = (v: number) => (o.log ? Math.log(v / o.min) / Math.log(o.max / o.min) : (v - o.min) / (o.max - o.min));
  const marks = document.createElement('div');
  marks.className = 'slider-marks';
  // labels that would collide (estimated at ~6.5 px per character in a 175 px column) drop to a second row
  const placed: { lo: number; hi: number; row: number }[] = [];
  const EST_W = o.trackPx ?? 175;
  for (const m of [...(o.marks ?? [])].sort((a, b) => toPos(a.value) - toPos(b.value))) {
    const frac = Math.min(1, Math.max(0, toPos(m.value)));
    const auto = frac > 0.72 ? 'end' : frac < 0.28 ? 'start' : 'center';
    const lines = m.label.split('<br>'), w = Math.max(...lines.map((l) => l.length)) * 6.5, px = 8 + frac * (EST_W - 16);
    const span = (a: string) => { const lo = a === 'start' ? px : a === 'end' ? px - w : px - w / 2; return { lo, hi: lo + w }; };
    const inside = (a: string) => { const { lo, hi } = span(a); return lo >= -4 && hi <= EST_W + 4; };
    const free = (a: string, row: number) => { const { lo, hi } = span(a); return !placed.some((p) => p.row === row && lo < p.hi + 6 && hi > p.lo - 6); };
    // keep the label on the first row by changing its alignment if that avoids a collision; otherwise drop a row
    let align = m.align ?? auto, row = m.row ?? 0;
    if (!m.align && m.row === undefined && !free(align, 0)) { const alt = (['start', 'end', 'center'] as const).find((a) => inside(a) && free(a, 0)); if (alt) align = alt; }
    while (!free(align, row) && row < 3) row++;
    const { lo, hi } = span(align);
    placed.push({ lo, hi, row });
    const mk = document.createElement('span');
    mk.className = 'slider-mark' + (align === 'end' ? ' mark-end' : align === 'start' ? ' mark-start' : '');
    mk.style.left = `calc(8px + ${frac} * (100% - 16px))`;
    if (row) { mk.style.top = `${row * 15}px`; marks.style.height = `${26 + row * 15}px`; }
    mk.innerHTML = `<i></i>${m.label}`;
    if (lines.length > 1) marks.style.height = `${Math.max(parseFloat(marks.style.height) || 26, 26 + row * 15 + (lines.length - 1) * 14)}px`;
    marks.append(mk);
  }
  const fromPos = (p: number) => (o.log ? o.min * Math.pow(o.max / o.min, p) : o.min + p * (o.max - o.min));
  input.min = '0';
  input.max = '1000';
  input.step = '1';
  let value = o.value;
  const listeners: ((v: number) => void)[] = [];
  const render = () => {
    out.textContent = (o.format ? o.format(value) : fmt(value)) + (o.unit ? ' ' + o.unit : '');
    input.value = String(Math.round(toPos(value) * 1000));
  };
  input.addEventListener('input', () => {
    let v = fromPos(Number(input.value) / 1000);
    if (o.step && !o.log) v = Math.round(v / o.step) * o.step;
    value = Math.min(o.max, Math.max(o.min, v));
    render();
    listeners.forEach((f) => f(value));
  });
  el.append(name, out, input);
  if (o.marks?.length) el.append(marks);
  render();
  return {
    el,
    get value() { return value; },
    onChange: (fn) => listeners.push(fn),
    set: (v) => { value = v; render(); listeners.forEach((f) => f(value)); },
  };
}

/** Segmented control (radio group). */
export function choice<T extends string>(label: string, options: { value: T; label: string }[], initial: T, onChange: (v: T) => void): { el: HTMLElement; value: T } {
  const el = document.createElement('div');
  el.className = 'choice';
  const name = document.createElement('span');
  name.className = 'slider-label';
  name.textContent = label;
  const group = document.createElement('div');
  group.className = 'choice-group';
  group.setAttribute('role', 'radiogroup');
  const state = { el, value: initial };
  for (const opt of options) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = opt.label;
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-checked', String(opt.value === initial));
    b.addEventListener('click', () => {
      state.value = opt.value;
      group.querySelectorAll('button').forEach((x) => x.setAttribute('aria-checked', String(x === b)));
      onChange(opt.value);
    });
    group.append(b);
  }
  el.append(name, group);
  return state;
}

/** Container for a figure's controls. */
export function controls(...items: HTMLElement[]): HTMLElement {
  const el = document.createElement('div');
  el.className = 'controls';
  el.append(...items);
  return el;
}

/** A labeled readout (value computed from the model). */
export function readout(label: string, note = ''): { el: HTMLElement; set(v: string): void } {
  const el = document.createElement('div');
  el.className = 'readout';
  const l = document.createElement('div');
  l.className = 'readout-label';
  l.innerHTML = label + (note ? ' ' + note : '');
  const v = document.createElement('div');
  v.className = 'readout-value';
  el.append(v, l);
  return { el, set: (s) => { v.innerHTML = s; } };
}
