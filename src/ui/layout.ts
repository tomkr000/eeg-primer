export interface Section {
  el: HTMLElement;
  /** two-column prose above the figure */
  text: HTMLElement;
  /** full-width figure area below the prose */
  fig: HTMLElement;
}

export function section(root: HTMLElement, id: string, number: string, title: string): Section {
  const el = document.createElement('section');
  el.id = id;
  el.className = 'section';
  const header = document.createElement('header');
  header.className = 'section-head';
  header.innerHTML = `<span class="section-number">${number}</span><h2>${title}</h2>`;
  const text = document.createElement('div');
  text.className = 'section-text';
  const fig = document.createElement('div');
  fig.className = 'section-fig';
  el.append(header, text, fig);
  root.append(el);
  return { el, text, fig };
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
export function figure(target: HTMLElement, caption: string, opts: { panelWidth?: string } = {}): Figure {
  const el = document.createElement('figure');
  el.className = 'figure';
  if (opts.panelWidth) el.style.setProperty('--panel-w', opts.panelWidth);
  const viz = document.createElement('div');
  viz.className = 'viz';
  const panel = document.createElement('div');
  panel.className = 'panel';
  const cap = document.createElement('figcaption');
  cap.innerHTML = caption;
  el.append(viz, panel, cap);
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
