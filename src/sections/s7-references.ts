import { CLAIMS } from '../data/claims';
import { REFERENCES } from '../data/references';
import { cite, formatReference } from '../ui/cite';
import { claimCite as c } from '../data/params';
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
<h3>How the models work</h3>
<p>Sections 1 and 2 calculate voltages from individual currents and groups of cells in uniform tissue
${cite('malmivuo1995')}. Section 3 adds spherical tissue layers ${c('sphere-model')}. Tests compare the
solver with a known solution and check voltage and current at each boundary.</p>
<p>Section 4 uses the public fsaverage head template ${c('fsaverage-bem')}. MNE-Python calculates how
cortical currents appear at scalp electrodes ${c('mne-bem')}. Section 5 illustrates how local contributions
add. Section 6 describes EEG rhythms and responses to events.</p>
<p>Section 7 combines a modeled rhythm with artifacts and recording noise ${c('noise-model-settings')}.
Section 8 passes that shared input through simplified contact circuits and adds noise
${c('electrode-model-settings')}. Their settings illustrate mechanisms rather than predict every headset.</p>
<p>Section 9 maps measured imagery responses onto modeled patches ${c('arm-response-model')}.
A calibrated decoder separates their overlapping changes, which amplifies noise ${c('arm-decoder')}.
The simulated person has ideal knowledge of the task ${c('arm-controller')}.
Tests check separation, noise statistics and the simulated success rates ${c('arm-success')}.</p>
<p>Section 10 isolates delay using a steady rhythm with a chosen fade and a moving measurement window
${c('delay-model')}. Section 11 calculates the best linear estimate of one patch from many electrodes.
Two numerical methods handle small and large arrays; tests check that they agree ${c('snr-electrodes')}.</p>
<h3>Limits of the models</h3>
<p>Real heads have irregular shapes, and tissue properties vary ${cite('mccann2019', 'tang2008')}.
The voltage drop from cortex to scalp also depends on the source's extent ${c('ecog-vs-eeg')}.
The arm results describe the chosen task and ideal controller, not a measured limit for all EEG control
${c('arm-task')}${c('arm-controller')}.</p>
<p>Some inputs have limited support. The contact-circuit values come largely from forearm measurements
${c('chi-table')}. The scalp-thickness input comes from a case report ${c('thickness-scalp')}.
Noise levels assigned to contact types are assumptions guided by measurements
${c('electrode-noise-levels')}. These limits are recorded in the verification log.</p>
<h3>How sources were checked</h3>
<p>Research agents gathered sources. Separate auditing agents received the claims without the research
notes and checked their support. Corrections and access limits appear in each claim's notes.
Status badges describe the current claim: verified, partially supported, unverified, derived or assumed.
A derived value is calculated from cited inputs. An assumption is a model choice.</p>`);
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
