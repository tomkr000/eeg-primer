export interface Section {
  el: HTMLElement;
  /** two-column prose, collapsed under an "In depth" toggle between the title and the figure */
  text: HTMLElement;
  /** full-width figure area below the prose */
  fig: HTMLElement;
}

export function section(root: HTMLElement, id: string, number: string, title: string, subtitle?: string): Section {
  const el = document.createElement('section');
  el.id = id;
  el.className = 'section';
  const header = document.createElement('header');
  header.className = 'section-head';
  header.innerHTML = `<span class="section-number">${number}</span><div><h2>${title}</h2>${subtitle ? `<p class="section-subtitle">${subtitle}</p>` : ''}</div>`;
  const text = document.createElement('div');
  text.className = 'section-text';
  const fig = document.createElement('div');
  fig.className = 'section-fig';
  el.append(header, inDepth(text), fig);
  root.append(el);
  return { el, text, fig };
}

/** Collapsible wrapper for the long-form text. */
/** A title above a graph. */
export function vizTitle(text: string): HTMLElement {
  const el = document.createElement('div');
  el.className = 'viz-title';
  el.textContent = text;
  return el;
}

/** An inline color swatch for captions and legends: show the color, never name it. */
export function sw(color: string, kind: 'patch' | 'line' | 'dash' | 'dot' | 'thick' | 'glow' = 'patch'): string {
  if (kind === 'patch') return `<i class="sw-i sw-patch" style="background:${color}"></i>`;
  if (kind === 'glow') return `<i class="sw-i sw-glow" style="background:linear-gradient(90deg,${color}00,${color})"></i>`;
  return `<i class="sw-i sw-line" style="border-top:${kind === 'thick' ? '5px solid' : kind === 'dash' ? '2px dashed' : kind === 'dot' ? '3px dotted' : '2.5px solid'} ${color}"></i>`;
}

export function inDepth(content: HTMLElement, label = 'In depth'): HTMLElement {
  const d = document.createElement('details');
  d.className = label === 'In depth' ? 'in-depth' : 'in-depth in-depth-question'; // a question as the toggle text gets heading size
  const s = document.createElement('summary');
  s.textContent = label;
  d.append(s, content);
  return d;
}

export function prose(target: HTMLElement, html: string): void {
  const d = document.createElement('div');
  d.className = 'prose';
  d.innerHTML = html;
  target.append(d);
}

export interface Figure {
  el: HTMLElement;
  /** visual area (canvas / plots), left */
  viz: HTMLElement;
  /** sliders and readouts, right */
  panel: HTMLElement;
  caption: HTMLElement;
}

/** A figure row sized for a laptop screen: visuals on the left, controls on the right, caption underneath. */
export function figure(target: HTMLElement, caption: string, opts: { panelWidth?: string; wide?: boolean } = {}): Figure {
  const el = document.createElement('figure');
  el.className = opts.wide ? 'figure figure-wide' : 'figure'; // wide: visuals across the full width, controls in a row below
  if (opts.panelWidth) el.style.setProperty('--panel-w', opts.panelWidth);
  const viz = document.createElement('div');
  viz.className = 'viz';
  const panel = document.createElement('div');
  panel.className = 'panel';
  const cap = document.createElement('figcaption');
  cap.innerHTML = caption;
  if (caption) {
    // the long description is fine print: collapsed by default, with its citations inside
    const d = document.createElement('details');
    d.className = 'caption-toggle';
    d.innerHTML = '<summary>Figure description</summary>';
    d.append(cap);
    el.append(viz, panel, d);
  } else el.append(viz, panel, cap);
  target.append(el);
  return { el, viz, panel, caption: cap };
}

/** Small table of model assumptions, collapsed by default. */
export function assumptions(target: HTMLElement, rows: { what: string; value: string; cite: string }[]): void {
  const d = document.createElement('details');
  d.className = 'assumptions';
  d.innerHTML = `<summary>Assumptions used in this model</summary><table><tbody>${rows
    .map((r) => `<tr><td>${r.what}</td><td>${r.value}</td><td>${r.cite}</td></tr>`)
    .join('')}</tbody></table>`;
  target.append(d);
}

/** Row of readouts. */
export function readouts(...items: HTMLElement[]): HTMLElement {
  const el = document.createElement('div');
  el.className = 'readouts';
  el.append(...items);
  return el;
}

/** An unnumbered section of plain prose (conclusion, method, references), optionally collapsed. */
export function plainSection(root: HTMLElement, id: string, title: string, collapsed = false): HTMLElement {
  const el = document.createElement('section');
  el.id = id;
  el.className = 'section section-plain';
  el.innerHTML = `<header class="section-head"><h2>${title}</h2></header>`;
  const body = document.createElement('div');
  body.className = 'section-body-plain';
  el.append(collapsed ? inDepth(body) : body);
  root.append(el);
  return body;
}
