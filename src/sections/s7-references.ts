import { CLAIMS } from '../data/claims';
import { REFERENCES } from '../data/references';
import { cite, formatReference } from '../ui/cite';
import { prose } from '../ui/layout';

function plainSection(root: HTMLElement, id: string, title: string): HTMLElement {
  const el = document.createElement('section');
  el.id = id;
  el.className = 'section section-plain';
  el.innerHTML = `<header class="section-head"><h2>${title}</h2></header>`;
  const body = document.createElement('div');
  body.className = 'section-body-plain';
  el.append(body);
  root.append(el);
  return body;
}

export function mountMethod(root: HTMLElement) {
  const body = plainSection(root, 'method', 'Method and caveats');
  prose(body, `
<p><strong>What the models are.</strong> Sections 1 and 2 use the quasi-static point-source and dipole
formulas in an infinite homogeneous conductor ${cite('malmivuo1995')}. Sections 3 and 6 solve the
concentric-sphere head model analytically: the potential in each shell is expanded in Legendre functions
and the coefficients are found per degree from continuity of potential and radial current at every
interface, the standard approach ${cite('demunck1993', 'zhang1995', 'nunez2019')}. The solver is
unit-tested against the closed-form homogeneous sphere (including the factor-of-3 enhancement for a central
dipole) and checked numerically for interface continuity. Section 4 synthesises a scalp channel from
published noise magnitudes and spectra; Section 5 uses lumped RC electrode–skin circuits scaled by
area. The realistic-head check in Section 6 is precomputed offline (<code>scripts/leadfield_svd.py</code>)
with MNE-Python’s boundary-element solver on the public fsaverage head ${cite('gramfort2013', 'mnefsaverage')};
the page ships only the resulting singular values, and a unit test pins the quoted counts to that data.</p>
<p><strong>What they are not.</strong> Real heads are not spheres: skull thickness and conductivity vary
by site and age ${cite('mccann2019', 'tang2008')}, cortex is folded, and sources are extended sheets rather
than points — which is why the cortex-to-scalp ratio ranges from 50–100 for a point dipole to
2–5 for a large synchronous sheet ${cite('nunez2019')}. The dimensionality count in section 6 assumes
a flat source spectrum and treats “above the noise floor” as the resolvability criterion; it is a
model-derived upper bound, offered next to the published estimates it agrees with
${cite('iivanainen2021')}. Numbers measured on the forearm (electrode impedances) are used as stand-ins
for the scalp ${cite('chi2010')}, and some thicknesses rest on thin evidence (the scalp value comes from a
clinical case report; the dura value from skull-base, not convexity, dura). Each such weakness is recorded
against its claim in the verification log.</p>
<p><strong>How the citations were checked.</strong> Claims were first gathered by research agents that had
to open each source and record the supporting sentence. The site’s final claims were then handed,
without the research notes, to separate auditing agents instructed to find errors: open the cited source,
locate the statement, and report <em>supported</em>, <em>partially supported</em> (with the discrepancy),
<em>not supported</em>, or <em>could not access</em>. Their findings are the status badges on every claim.
Paywalled sources were checked against their abstracts where the number appears there; a few could only be
confirmed through a secondary source and are marked accordingly.</p>`);
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
  const sectionNames = ['', 'Neuron', 'Population', 'Head', 'Noise', 'Electrodes', 'Dimensionality'];
  for (const c of CLAIMS) {
    const tr = document.createElement('tr');
    tr.id = `claim-${c.id}`;
    tr.innerHTML = `<td class="claim-sec">${sectionNames[c.section]}</td><td>${c.statement}${c.note ? `<div class="claim-note">${c.note}</div>` : ''}</td><td>${c.refs.length ? cite(...c.refs) : '—'}</td><td><span class="status status-${c.status}">${c.status}</span></td>`;
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
  foot.innerHTML = `Built with Vite and D3. Source and verification notes live in this repository; edit <code>src/data/claims.ts</code> to change a number and the citation travels with it.`;
  body.append(foot);
}
