import * as d3 from 'd3';

/** A potential-versus-height plot: height on the vertical axis (shared with a neighbouring cross-section), potential on a log x axis. */
export interface VerticalProfile {
  /** `muteAbove`: the part of the curve above this height is drawn gray and dashed (present but unreadable) */
  update(points: [number, number][], bands: { from: number; to: number; label: string; color: string }[], markers: { value: number; label: string }[], source?: number, muteAbove?: number): void;
}

export function verticalProfile(container: HTMLElement, cfg: { height: number; yDomain: [number, number]; yLabel: string; xLabel: string; xDomain: [number, number] }): VerticalProfile {
  const M = { top: 0, right: 34, bottom: 44, left: 44 };
  const root = d3.select(container).append('div').attr('class', 'plot');
  const svg = root.append('svg').attr('class', 'plot-svg').attr('height', cfg.height + M.bottom);
  const gBands = svg.append('g');
  const gGrid = svg.append('g').attr('class', 'grid');
  const pathMuted = svg.append('path').attr('fill', 'none').attr('stroke', '#b8b6ae').attr('stroke-width', 1.5).attr('stroke-dasharray', '2 5');
  const path = svg.append('path').attr('fill', 'none').attr('stroke', '#2a78d6').attr('stroke-width', 2.5);
  const gLabels = svg.append('g'); // band labels sit above the profile line so it never cuts through them
  const gMarkers = svg.append('g');
  const gX = svg.append('g').attr('class', 'axis');
  const gY = svg.append('g').attr('class', 'axis');
  const xLabel = svg.append('text').attr('class', 'axis-label').attr('text-anchor', 'middle');
  const yLabel = svg.append('text').attr('class', 'axis-label').attr('text-anchor', 'middle').attr('transform', 'rotate(-90)');
  let pts: [number, number][] = [], bands: { from: number; to: number; label: string; color: string }[] = [], markers: { value: number; label: string }[] = [], source: number | undefined, muteAbove = Infinity;

  function render() {
    const width = Math.max(container.clientWidth || 300, M.left + M.right + 40);
    const H = cfg.height;
    svg.attr('width', width).attr('viewBox', `0 0 ${width} ${H + M.bottom}`);
    const iw = width - M.left - M.right;
    const x = d3.scaleLog().domain(cfg.xDomain).range([M.left, M.left + iw]);
    const y = d3.scaleLinear().domain(cfg.yDomain).range([M.top + H, M.top]);
    const logFmt = (v: number) => { const e = Math.log10(v); return Math.abs(e - Math.round(e)) > 1e-9 ? '' : d3.format(',~g')(v); };
    gX.attr('transform', `translate(0,${M.top + H})`).call(d3.axisBottom(x).ticks(5).tickFormat((v) => logFmt(+v)));
    gY.attr('transform', `translate(${M.left},0)`).call(d3.axisLeft(y).ticks(5));
    xLabel.attr('x', M.left + iw / 2).attr('y', H + M.bottom - 6).text(cfg.xLabel);
    yLabel.attr('x', -(M.top + H / 2)).attr('y', 12).text(cfg.yLabel);
    const b = gBands.selectAll('g.band').data(bands);
    const be = b.enter().append('g').attr('class', 'band');
    be.append('rect');
    b.exit().remove();
    const all = be.merge(b as never);
    all.select('rect').attr('x', M.left).attr('width', iw).attr('y', (d) => y(d.to)).attr('height', (d) => Math.max(0, y(d.from) - y(d.to))).attr('fill', (d) => d.color).attr('opacity', 0.18);
    gLabels.selectAll('text').data(bands).join('text').attr('class', 'band-label').attr('x', M.left + iw - 6).attr('y', (d) => (y(d.from) + y(d.to)) / 2 + 4).attr('text-anchor', 'end').text((d) => (y(d.from) - y(d.to) > 14 ? d.label : ''));
    gGrid.selectAll('line').data(x.ticks(5).filter((v) => logFmt(v) !== '')).join('line').attr('x1', (v) => x(v)).attr('x2', (v) => x(v)).attr('y1', M.top).attr('y2', M.top + H);
    const line = d3.line<[number, number]>().x((p) => x(Math.max(cfg.xDomain[0], Math.min(cfg.xDomain[1], p[0])))).y((p) => y(p[1]));
    const ok = pts.filter((p) => p[0] > 0);
    path.attr('d', line(ok.filter((p) => p[1] <= muteAbove)));
    pathMuted.attr('d', line(ok.filter((p) => p[1] >= muteAbove)));
    const mk = gMarkers.selectAll('g.marker').data(markers);
    const me = mk.enter().append('g').attr('class', 'marker');
    me.append('line').attr('stroke', '#52514e').attr('stroke-dasharray', '4 3');
    me.append('text').attr('class', 'marker-label');
    mk.exit().remove();
    const mall = me.merge(mk as never);
    mall.select('line').attr('x1', (d) => x(d.value)).attr('x2', (d) => x(d.value)).attr('y1', M.top).attr('y2', M.top + H);
    mall.select('text').attr('x', (d) => x(d.value) + 4).attr('y', M.top + 14).text((d) => d.label);
    gMarkers.selectAll('circle.src').data(source === undefined ? [] : [source]).join('circle').attr('class', 'src').attr('cx', M.left + iw).attr('cy', (d) => y(d)).attr('r', 0);
  }
  new ResizeObserver(() => render()).observe(container);
  return { update(p, bnd, m, src, mute) { pts = p; bands = bnd; markers = m; source = src; muteAbove = mute ?? Infinity; render(); } };
}
