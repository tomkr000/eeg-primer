import './style.css';
import { mountNeuron } from './sections/s01-neuron';
import { mountPopulation } from './sections/s02-population';
import { mountHead } from './sections/s03-head';
import { mountBlur } from './sections/s04-blur';
import { mountPatchRegions } from './sections/s05-patches';
import { mountSynchrony } from './sections/s06-synchrony';
import { mountNoise } from './sections/s07-noise';
import { mountElectrodes } from './sections/s08-electrodes';
import { mountDimensions } from './sections/s09-dimensions';
import { mountDelay } from './sections/s10-delay';
import { mountCount } from './sections/s11-count';
import { mountStates } from './sections/s12-states';
import { mountConclusion } from './sections/conclusion';
import { mountMethod, mountReferences, mountVerification } from './sections/references';
import { inDepth } from './ui/layout';
import { claimById } from './data/claims';

const app = document.getElementById('app')!;

const hero = document.createElement('header');
hero.className = 'hero';
hero.innerHTML = `
  <h1>EEG primer: the physics of a non-invasive BCI</h1>`;
const standfirst = document.createElement('div');
standfirst.className = 'standfirst';
standfirst.innerHTML = `<p>Scalp electroencephalography (EEG) records voltage differences at the head.
A brain–computer interface (BCI) can use these recordings to issue commands.</p>
<p>The interactive models trace a signal from one cell to the scalp. They show how tissue, noise and
 electrode contact affect the recording. Later sections explore independent commands, response delays
and the benefit of adding electrodes. Physical claims link to sources and their verification status.</p>`;
hero.append(inDepth(standfirst));
const toc = document.createElement('nav');
toc.className = 'toc';
toc.setAttribute('aria-label', 'Sections');
toc.innerHTML = `
    <a href="#neuron"><b>1</b> Neurons make very small electric fields</a>
    <a href="#population"><b>2</b> Coordinated neurons make larger signals</a>
    <a href="#head"><b>3</b> The head weakens and spreads cortical signals</a>
    <a href="#blur"><b>4</b> Patches of cortex blur into broad blobs at the scalp</a>
    <a href="#patches"><b>5</b> Local patches combine into changing scalp voltages</a>
    <a href="#synchrony"><b>6</b> EEG signals reveal rhythms and responses to events</a>
    <a href="#noise"><b>7</b> The signal that gets outside the skull is noisy</a>
    <a href="#electrodes"><b>8</b> Electrode contact affects signal loss and added noise</a>
    <a href="#dimensions"><b>9</b> Overlapping rhythm changes make joint control harder</a>
    <a href="#delay"><b>10</b> EEG signals have inherent delays</a>
    <a href="#count"><b>11</b> In this model, more electrodes cannot tell two typing fingers apart</a>
    <a href="#states"><b>12</b> Named brain states share a few scalp signals</a>
    <a href="#conclusion">Conclusion</a>
    <a href="#method">Method and caveats</a>
    <a href="#verification">Verification log</a>
    <a href="#references">References</a>`;
hero.append(toc);
app.append(hero);

const main = document.createElement('main');
app.append(main);
mountNeuron(main);
mountPopulation(main);
mountHead(main);
mountBlur(main);
mountPatchRegions(main);
mountSynchrony(main);
mountNoise(main);
mountElectrodes(main);
mountDimensions(main);
mountDelay(main);
mountCount(main);
mountStates(main);
mountConclusion(main);
mountMethod(main);
mountVerification(main);
mountReferences(main);

// hover card for citation markers: shows the claim statement and its verification status
const card = document.createElement('div');
card.className = 'claim-card';
card.hidden = true;
document.body.append(card);
let hideTimer = 0;
document.addEventListener('mouseover', (ev) => {
  const el = (ev.target as HTMLElement).closest<HTMLElement>('.claim');
  if (!el) return;
  const claim = claimById.get(el.dataset.claim!);
  if (!claim) return;
  clearTimeout(hideTimer);
  card.innerHTML = `<span class="status status-${claim.status}">${claim.status}</span>${claim.statement}${claim.note ? `<div class="claim-note">${claim.note}</div>` : ''}<a class="claim-link" href="#claim-${claim.id}">verification entry →</a>`;
  card.hidden = false;
  const r = el.getBoundingClientRect();
  const w = Math.min(420, window.innerWidth - 24);
  card.style.width = `${w}px`;
  card.style.left = `${Math.max(12, Math.min(r.left, window.innerWidth - w - 12))}px`;
  card.style.top = `${r.bottom + window.scrollY + 6}px`;
});
document.addEventListener('mouseout', (ev) => {
  const el = (ev.target as HTMLElement).closest('.claim');
  if (!el) return;
  hideTimer = window.setTimeout(() => { if (!card.matches(':hover')) card.hidden = true; }, 250);
});
card.addEventListener('mouseleave', () => { card.hidden = true; });
