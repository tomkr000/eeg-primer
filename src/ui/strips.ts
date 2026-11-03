import * as d3 from 'd3';

/** One row of a strip plot: a trace with its own vertical scale. */
export interface Strip {
  name: string;
  color: string;
  points: [number, number][];
  /** short text drawn at the right of the strip (e.g. a noise figure) */
  note?: string;
  /** small line under the name */
  sub?: string;
  /** SVG markup (a <g> sized 44 × 44) drawn at the left of the name */
  icon?: string;
  /** draw a box around the whole strip */
  highlight?: boolean;
}

/** an event marked across all strips: a dashed line, with a boxed label at the top of the first strip */
export interface StripMarker { t: number; label: string; }

export interface StripPlot {
  update(strips: Strip[], markers?: StripMarker[]): void;
}

const M = { top: 6, right: 14, bottom: 36, left: 322 };
const ICON = 52; // icon column width

/**
 * Small multiples sharing one time axis. Every strip is scaled to its own peak so the shape of each trace is
 * visible whatever its amplitude; the amplitude is written on the strip instead.
 */
export function stripPlot(container: HTMLElement, cfg: { xLabel: string; xDomain: [number, number]; stripHeight?: number }): StripPlot {
  const sh = cfg.stripHeight ?? 64;
  const root = d3.select(container).append('div').attr('class', 'plot');
  const svg = root.append('svg').attr('class', 'plot-svg');
  const gRows = svg.append('g');
  const gMarks = svg.append('g');
  const gX = svg.append('g').attr('class', 'axis');
  const xLabel = svg.append('text').attr('class', 'axis-label').attr('text-anchor', 'middle');
  let strips: Strip[] = [], markers: StripMarker[] = [];

  function render() {
    const width = Math.max(container.clientWidth || 600, M.left + M.right + 40);
    const height = M.top + strips.length * sh + M.bottom;
    svg.attr('width', width).attr('height', height).attr('viewBox', `0 0 ${width} ${height}`);
    const iw = width - M.left - M.right;
    const x = d3.scaleLinear().domain(cfg.xDomain).range([M.left, M.left + iw]);
    gX.attr('transform', `translate(0,${M.top + strips.length * sh})`).call(d3.axisBottom(x).ticks(6));
    xLabel.attr('x', M.left + iw / 2).attr('y', height - 6).text(cfg.xLabel);
    const rows = gRows.selectAll<SVGGElement, Strip>('g.strip').data(strips, (d) => d.name);
    rows.exit().remove();
    const enter = rows.enter().append('g').attr('class', 'strip');
    enter.append('rect').attr('class', 'strip-box');
    enter.append('line').attr('class', 'strip-base');
    enter.append('rect').attr('class', 'strip-sep');
    enter.append('path').attr('class', 'strip-path');
    enter.append('g').attr('class', 'strip-icon');
    enter.append('text').attr('class', 'strip-name');
    enter.append('text').attr('class', 'strip-sub');
    enter.append('text').attr('class', 'strip-scale');
    enter.append('text').attr('class', 'strip-note').attr('text-anchor', 'end');
    const all = enter.merge(rows);
    all.attr('transform', (_, i) => `translate(0,${M.top + i * sh})`);
    all.each(function (d) {
      const g = d3.select(this);
      const peak = Math.max(1e-9, d3.max(d.points, (p) => Math.abs(p[1])) ?? 0);
      const y = d3.scaleLinear().domain([-peak, peak]).range([sh - 3, 17]);
      g.select('rect.strip-box').attr('x', 2).attr('y', 2).attr('width', width - 4).attr('height', sh - 4).attr('rx', 6).attr('visibility', d.highlight ? 'visible' : 'hidden');
      g.select('line.strip-base').attr('x1', M.left).attr('x2', M.left + iw).attr('y1', y(0)).attr('y2', y(0));
      g.select('rect.strip-sep').attr('x', M.left).attr('width', iw).attr('y', sh - 0.5).attr('height', 1);
      const line = d3.line<[number, number]>().x((p) => x(p[0])).y((p) => y(p[1]));
      g.select('path.strip-path').attr('d', line(d.points)).attr('stroke', d.color);
      const tx = d.icon ? ICON : 0;
      g.select('g.strip-icon').attr('transform', `translate(0,${(sh - 44) / 2})`).html(d.icon ?? '');
      const hasSub = !!d.sub;
      g.select('text.strip-name').attr('x', tx).attr('y', hasSub ? sh / 2 - 9 : sh / 2 - 2).text(d.name);
      g.select('text.strip-sub').attr('x', tx).attr('y', sh / 2 + 5).text(d.sub ?? '');
      g.select('text.strip-scale').attr('x', tx).attr('y', hasSub ? sh / 2 + 19 : sh / 2 + 13).text(`±${formatPeak(peak)} µV`);
      g.select('text.strip-note').attr('x', M.left + iw - 4).attr('y', 14).text(d.note ?? '');
    });
    gMarks.selectAll('*').remove();
    for (const m of markers) {
      const mx = x(m.t);
      gMarks.append('line').attr('x1', mx).attr('x2', mx).attr('y1', M.top + 15).attr('y2', M.top + strips.length * sh).attr('stroke', '#52514e').attr('stroke-dasharray', '4 3');
      // the label sits in the top band of the first strip, left of the line, boxed like the callouts of section 5
      const txt = gMarks.append('text').attr('class', 'callout-text').attr('x', mx - 14).attr('y', M.top + 12).attr('text-anchor', 'end').text(m.label);
      const bb = (txt.node() as SVGTextElement).getBBox();
      gMarks.insert('rect', 'text').attr('class', 'callout-box').attr('x', bb.x - 6).attr('y', bb.y - 2).attr('width', bb.width + 12).attr('height', bb.height + 4).attr('rx', 4);
      gMarks.append('line').attr('class', 'callout-line').attr('x1', bb.x + bb.width + 6).attr('x2', mx).attr('y1', bb.y + bb.height / 2).attr('y2', bb.y + bb.height / 2);
    }
  }
  const ro = new ResizeObserver(() => render());
  ro.observe(container);
  return { update(s, m) { strips = s; markers = m ?? []; render(); } };
}

function formatPeak(v: number): string {
  if (v >= 1000) return d3.format(',.0f')(v);
  if (v >= 100) return d3.format('.0f')(v);
  if (v >= 10) return d3.format('.1f')(v);
  return d3.format('.2f')(v);
}
