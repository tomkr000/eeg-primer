import { CLAIMS } from '../data/claims';
import { REFERENCES } from '../data/references';
import { cite, formatReference } from '../ui/cite';
import { prose, inDepth } from '../ui/layout';

function plainSection(root: HTMLElement, id: string, title: string, collapsed = false): HTMLElement {
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

export function mountMethod(root: HTMLElement) {
  const body = plainSection(root, 'method', 'Method and caveats', true);
  prose(body, `
<p><strong>The models.</strong> Sections 1 and 2 use the quasi-static point-source and dipole formulas in a
uniform conductor ${cite('malmivuo1995')}. Section 3 solves the concentric-sphere head analytically
${cite('demunck1993', 'nunez2019')}; the solver is unit-tested against the closed-form homogeneous sphere
and checked for continuity of potential and current at every interface. Section 4 uses a lead field computed
offline with MNE-Python’s boundary-element solver on the public fsaverage head ${cite('gramfort2013', 'mnefsaverage')}
(<code>scripts/</code>); the page ships only the resulting matrices, and a unit test pins the quoted counts to that
data. Section 5 illustrates local patches and their signed voltage contributions; section 6 describes EEG rhythms and event responses. Section 7 synthesises a scalp channel from published noise magnitudes; section 8 passes that channel through
lumped electrode–skin circuits. Section 9 treats a rhythm as band-limited Gaussian noise whose power, averaged over a
window, is gamma distributed ${cite('condon2016')}; section 10 runs the same kind of rhythm through a sliding-window
detector. Section 11 computes the best linear estimate of one patch from N electrodes on the sphere of section 3,
exactly in electrode space up to 128 electrodes and per spherical-harmonic degree above that; unit tests check that the
two agree and that the simulated band power scatters as the gamma model says.</p>
<p><strong>What they are not.</strong> Real heads are not spheres and skull properties vary by site and age
${cite('mccann2019', 'tang2008')}; sources are sheets, not points, which is why the cortex-to-scalp ratio
ranges from 50–100 for a point dipole to 2–5 for a large synchronous sheet ${cite('nunez2019')}. The
accuracies in sections 9 and 11 are upper bounds: real rhythms fluctuate more than Gaussian noise of the same
bandwidth, the imagery classes overlap, and a real decoder learns its weights from limited calibration data. Some inputs rest on thin
evidence: electrode impedances were measured on the forearm ${cite('chi2010')}, the scalp thickness comes
from a case report, and the noise levels per electrode type are assumptions guided by the measured
1–20 µV range. Each weakness is recorded against its claim in the verification log.</p>
<p><strong>How the citations were checked.</strong> Research agents gathered each fact and had to open the
source. The final claims were then handed, without those notes, to separate auditing agents told to find
errors by opening the cited source and reporting supported, partially supported, not supported, or could
not access. Corrections were applied and are noted on the claims; the status badges reflect the corrected
statement.</p>`);
}

export function mountVerification(root: HTMLElement) {
  const body = plainSection(root, 'verification', 'Verification log');
  const counts = CLAIMS.reduce<Record<string, number>>((acc, c) => { acc[c.status] = (acc[c.status] ?? 0) + 1; return acc; }, {});
  const summary = document.createElement('p');
  summary.className = 'prose';
  summary.innerHTML = `${CLAIMS.length} claims: ` + Object.entries(counts).map(([k, v]) => `<span class="status status-${k}">${k}</span> ${v}`).join(' · ');
  body.append(summary);
  const table = document.createElement('table');
  table.className = 'claims-table';
  table.innerHTML = `<thead><tr><th>#</th><th>Claim</th><th>Sources</th><th>Status</th></tr></thead>`;
  const tb = document.createElement('tbody');
  const sectionNames = ['', 'Neuron', 'Population', 'Head', 'Scalp maps', 'Patches and sums', 'EEG signals', 'Noise', 'Electrodes', 'Dimensionality', 'Delays', 'Electrode count'];
  for (const c of CLAIMS) {
    const tr = document.createElement('tr');
    tr.id = `claim-${c.id}`;
    tr.innerHTML = `<td class="claim-sec">${sectionNames[c.section]}</td><td>${c.statement}${c.note ? `<div class="claim-note">${c.note}</div>` : ''}</td><td>${c.refs.length ? cite(...c.refs) : 'none'}</td><td><span class="status status-${c.status}">${c.status}</span></td>`;
    tb.append(tr);
  }
  table.append(tb);
  body.append(table);
}

export function mountReferences(root: HTMLElement) {
  const body = plainSection(root, 'references', 'References');
  const ol = document.createElement('ol');
  ol.className = 'references';
  for (const r of REFERENCES) {
    const li = document.createElement('li');
    li.id = `ref-${r.key}`;
    li.innerHTML = formatReference(r);
    ol.append(li);
  }
  body.append(ol);
  const foot = document.createElement('footer');
  foot.className = 'site-foot';
  foot.innerHTML = `Built with Vite and D3. Edit <code>src/data/claims.ts</code> to change a number; the citation, hover card and log entry follow.`;
  body.append(foot);
}
