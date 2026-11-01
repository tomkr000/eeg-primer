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
  const head = document.createElement('div');
  head.className = 'slider-head';
  const name = document.createElement('span');
  name.className = 'slider-label';
  name.innerHTML = o.label + (o.note ? ' ' + o.note : '');
  const out = document.createElement('output');
  head.append(name, out);
  const input = document.createElement('input');
  input.type = 'range';
  const toPos = (v: number) => (o.log ? Math.log(v / o.min) / Math.log(o.max / o.min) : (v - o.min) / (o.max - o.min));
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
  el.append(head, input);
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

/** A labelled readout (value computed from the model). */
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
