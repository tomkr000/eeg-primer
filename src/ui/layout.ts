export interface Section {
  el: HTMLElement;
  text: HTMLElement;
  fig: HTMLElement;
}

export function section(root: HTMLElement, id: string, number: string, title: string): Section {
  const el = document.createElement('section');
  el.id = id;
  el.className = 'section';
  const header = document.createElement('header');
  header.className = 'section-head';
  header.innerHTML = `<span class="section-number">${number}</span><h2>${title}</h2>`;
  const body = document.createElement('div');
  body.className = 'section-body';
  const text = document.createElement('div');
  text.className = 'section-text';
  const fig = document.createElement('div');
  fig.className = 'section-fig';
  body.append(text, fig);
  el.append(header, body);
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
  plotArea: HTMLElement;
  controls: HTMLElement;
}

export function figure(target: HTMLElement, caption: string): Figure {
  const el = document.createElement('figure');
  el.className = 'figure';
  const plotArea = document.createElement('div');
  plotArea.className = 'plot-area';
  const cap = document.createElement('figcaption');
  cap.innerHTML = caption;
  const ctr = document.createElement('div');
  ctr.className = 'figure-controls';
  el.append(plotArea, cap, ctr);
  target.append(el);
  return { el, plotArea, controls: ctr };
}

/** Small table of model assumptions shown under a figure. */
export function assumptions(target: HTMLElement, rows: { what: string; value: string; cite: string }[]): void {
  const d = document.createElement('details');
  d.className = 'assumptions';
  d.innerHTML = `<summary>Assumptions used in this model</summary><table><tbody>${rows
    .map((r) => `<tr><td>${r.what}</td><td>${r.value}</td><td>${r.cite}</td></tr>`)
    .join('')}</tbody></table>`;
  target.append(d);
}
