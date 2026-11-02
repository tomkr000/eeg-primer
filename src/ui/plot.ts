import * as d3 from 'd3';
import { fmt } from './slider';

export type Pt = [number, number];
export interface Series {
  name: string;
  points: Pt[];
  color: string;
  dashed?: boolean;
  /** draw as dots instead of a line */
  dots?: boolean;
  width?: number;
}
export interface Marker {
  /** 'x' → vertical line at value, 'y' → horizontal line */
  axis: 'x' | 'y';
  value: number;
  label: string;
  color?: string;
}
export interface AxisCfg {
  label: string;
  scale?: 'linear' | 'log';
  domain?: [number, number];
  format?: (v: number) => string;
}
export interface PlotCfg {
  x: AxisCfg;
  y: AxisCfg;
  height?: number;
  /** shaded x-band regions */
  bands?: { from: number; to: number; label: string; color: string }[];
  /** draw the legend inside the plot area (top left) instead of below it */
  legendInside?: boolean;
}

export interface Plot {
  update(series: Series[], markers?: Marker[], bands?: PlotCfg['bands']): void;
}

const MARGIN = { top: 14, right: 18, bottom: 44, left: 58 };

export function linePlot(container: HTMLElement, cfg: PlotCfg): Plot {
  const height = cfg.height ?? 300;
  const root = d3.select(container).append('div').attr('class', 'plot');
  const svg = root.append('svg').attr('class', 'plot-svg').attr('height', height);
  const clipId = `clip-${Math.random().toString(36).slice(2, 9)}`;
  const clipRect = svg.append('clipPath').attr('id', clipId).append('rect');
  const gGrid = svg.append('g').attr('class', 'grid');
  const gBands = svg.append('g');
  const gSeries = svg.append('g').attr('clip-path', `url(#${clipId})`);
  const gMarkers = svg.append('g');
  const gX = svg.append('g').attr('class', 'axis');
  const gY = svg.append('g').attr('class', 'axis');
  const xLabel = svg.append('text').attr('class', 'axis-label').attr('text-anchor', 'middle');
  const yLabel = svg.append('text').attr('class', 'axis-label').attr('text-anchor', 'middle').attr('transform', 'rotate(-90)');
  const gHover = svg.append('g').style('display', 'none');
  const hoverLine = gHover.append('line').attr('class', 'crosshair');
  const tip = root.append('div').attr('class', 'tooltip').style('display', 'none');
  const legend = root.append('div').attr('class', 'legend' + (cfg.legendInside ? ' legend-inside' : ''));
  if (cfg.legendInside) legend.style('left', `${MARGIN.left + 10}px`).style('top', `${MARGIN.top + 6}px`);
  const overlay = svg.append('rect').attr('fill', 'transparent');

  let series: Series[] = [], markers: Marker[] = [], bands = cfg.bands ?? [];
  const mkScale = (a: AxisCfg) => (a.scale === 'log' ? d3.scaleLog() : d3.scaleLinear());

  function render() {
    const width = container.clientWidth || 600;
    svg.attr('width', width).attr('viewBox', `0 0 ${width} ${height}`);
    const iw = width - MARGIN.left - MARGIN.right, ih = height - MARGIN.top - MARGIN.bottom;
    clipRect.attr('x', MARGIN.left).attr('y', MARGIN.top - 2).attr('width', iw).attr('height', ih + 2);
    const all = series.flatMap((s) => s.points).filter((p) => isFinite(p[0]) && isFinite(p[1]) && (cfg.x.scale !== 'log' || p[0] > 0) && (cfg.y.scale !== 'log' || p[1] > 0));
    const xd = cfg.x.domain ?? (d3.extent(all, (p) => p[0]) as [number, number]);
    const yd = cfg.y.domain ?? (d3.extent(all, (p) => p[1]) as [number, number]);
    const x = mkScale(cfg.x).domain(xd).range([MARGIN.left, MARGIN.left + iw]);
    const y = mkScale(cfg.y).domain(yd).range([MARGIN.top + ih, MARGIN.top]);
    const xAxis = d3.axisBottom(x).ticks(6);
    const yAxis = d3.axisLeft(y).ticks(5);
    // log axes: plain numbers in the readable range, short scientific notation outside it
    const logFmt = (v: number) => {
      const e = Math.log10(v);
      if (Math.abs(e - Math.round(e)) > 1e-9) return ''; // label the powers of ten only
      return v >= 1e-3 && v < 1e6 ? d3.format(',~g')(v) : d3.format('.0~e')(v).replace('e-', 'e−');
    };
    if (cfg.x.scale === 'log') xAxis.tickFormat((v) => logFmt(+v));
    if (cfg.y.scale === 'log') yAxis.tickFormat((v) => logFmt(+v));
    if (cfg.x.format) xAxis.tickFormat((v) => cfg.x.format!(+v));
    else if (cfg.x.scale === 'log') xAxis.ticks(6, (v: number) => fmt(v, 2));
    if (cfg.y.format) yAxis.tickFormat((v) => cfg.y.format!(+v));
    else if (cfg.y.scale === 'log') yAxis.ticks(5, (v: number) => fmt(v, 2));
    gX.attr('transform', `translate(0,${MARGIN.top + ih})`).call(xAxis as never);
    gY.attr('transform', `translate(${MARGIN.left},0)`).call(yAxis as never);
    gGrid.selectAll('*').remove();
    gGrid.selectAll('line').data(y.ticks(5)).join('line')
      .attr('x1', MARGIN.left).attr('x2', MARGIN.left + iw).attr('y1', (d) => y(d)).attr('y2', (d) => y(d));
    xLabel.attr('x', MARGIN.left + iw / 2).attr('y', height - 8).text(cfg.x.label);
    yLabel.attr('x', -(MARGIN.top + ih / 2)).attr('y', 14).text(cfg.y.label);

    gBands.selectAll('*').remove();
    for (const b of bands) {
      const x0 = x(Math.max(b.from, xd[0])), x1 = x(Math.min(b.to, xd[1]));
      if (!(x1 > x0)) continue;
      gBands.append('rect').attr('x', x0).attr('y', MARGIN.top).attr('width', x1 - x0).attr('height', ih).attr('fill', b.color).attr('opacity', 0.12);
      if (x1 - x0 > 34) gBands.append('text').attr('class', 'band-label').attr('x', (x0 + x1) / 2).attr('y', MARGIN.top + 12).attr('text-anchor', 'middle').text(b.label);
    }

    const line = d3.line<Pt>().defined((p) => isFinite(p[1]) && (cfg.y.scale !== 'log' || p[1] > 0) && (cfg.x.scale !== 'log' || p[0] > 0)).x((p) => x(p[0])).y((p) => y(p[1]));
    gSeries.selectAll('*').remove();
    for (const s of series) {
      if (s.dots) {
        gSeries.selectAll(null).data(s.points.filter((p) => line.defined()(p, 0, s.points))).join('circle')
          .attr('cx', (p) => x(p[0])).attr('cy', (p) => y(p[1])).attr('r', 4.5).attr('fill', s.color).attr('stroke', 'var(--surface-1)').attr('stroke-width', 2);
      } else {
        gSeries.append('path').datum(s.points).attr('d', line).attr('fill', 'none').attr('stroke', s.color)
          .attr('stroke-width', s.width ?? 2).attr('stroke-dasharray', s.dashed ? '6 4' : null).attr('stroke-linejoin', 'round');
      }
    }
    gMarkers.selectAll('*').remove();
    for (const m of markers) {
      const col = m.color ?? 'var(--text-secondary)';
      if (m.axis === 'y') {
        if (m.value < yd[0] || m.value > yd[1]) continue;
        gMarkers.append('line').attr('x1', MARGIN.left).attr('x2', MARGIN.left + iw).attr('y1', y(m.value)).attr('y2', y(m.value)).attr('stroke', col).attr('stroke-dasharray', '2 3');
        gMarkers.append('text').attr('class', 'marker-label').attr('x', MARGIN.left + iw - 4).attr('y', y(m.value) - 4).attr('text-anchor', 'end').attr('fill', col).text(m.label);
      } else {
        if (m.value < xd[0] || m.value > xd[1]) continue;
        gMarkers.append('line').attr('y1', MARGIN.top).attr('y2', MARGIN.top + ih).attr('x1', x(m.value)).attr('x2', x(m.value)).attr('stroke', col).attr('stroke-dasharray', '2 3');
        const nearRight = x(m.value) > MARGIN.left + iw * 0.8;
        gMarkers.append('text').attr('class', 'marker-label').attr('x', x(m.value) + (nearRight ? -4 : 4)).attr('y', MARGIN.top + ih - 6).attr('text-anchor', nearRight ? 'end' : 'start').attr('fill', col).text(m.label);
      }
    }
    // legend (only for ≥ 2 series)
    legend.selectAll('*').remove();
    if (series.length >= 2) {
      legend.selectAll('span').data(series).join('span').attr('class', 'legend-item')
        .html((s) => s.dots ? `<i class="legend-dot" style="background:${s.color}"></i>${s.name}` : `<i style="border-top:3px ${s.dashed ? 'dashed' : 'solid'} ${s.color}"></i>${s.name}`);
    }
    // hover
    overlay.attr('x', MARGIN.left).attr('y', MARGIN.top).attr('width', iw).attr('height', ih)
      .on('mousemove', (ev: MouseEvent) => {
        const [mx] = d3.pointer(ev);
        const xv = x.invert(mx);
        gHover.style('display', null);
        hoverLine.attr('x1', mx).attr('x2', mx).attr('y1', MARGIN.top).attr('y2', MARGIN.top + ih);
        const rows = series.map((s) => {
          const i = d3.bisector((p: Pt) => p[0]).center(s.points, xv);
          const p = s.points[i];
          return p ? `<div><i style="background:${s.color}"></i>${s.name}: <b>${fmt(p[1])}</b></div>` : '';
        });
        tip.style('display', null).style('left', `${Math.min(mx + 12, width - 180)}px`).style('top', `${MARGIN.top}px`)
          .html(`<div class="tip-x">${cfg.x.label.split(' (')[0]}: ${fmt(xv)}</div>${rows.join('')}`);
      })
      .on('mouseleave', () => { gHover.style('display', 'none'); tip.style('display', 'none'); });
  }
  const ro = new ResizeObserver(() => render());
  ro.observe(container);
  return {
    update(s, m = [], b) { series = s; markers = m; if (b) bands = b; render(); },
  };
}
