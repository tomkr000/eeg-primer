import './style.css';
import { mountNeuron } from './sections/s1-neuron';
import { mountPopulation } from './sections/s2-population';
import { mountHead } from './sections/s3-head';
import { mountNoise } from './sections/s5-noise';
import { mountElectrodes } from './sections/s6-electrodes';
import { mountBlur } from './sections/s4-blur';
import { mountSynchrony } from './sections/synchrony';
import { mountDimensions } from './sections/s7-dimensions';
import { mountDelay } from './sections/s8-delay';
import { mountCount } from './sections/s9-count';
import { mountMethod, mountReferences, mountVerification } from './sections/s7-references';
import { inDepth } from './ui/layout';
import { claimById } from './data/claims';

const app = document.getElementById('app')!;

const hero = document.createElement('header');
hero.className = 'hero';
hero.innerHTML = `
  <p class="kicker">An interactive, cited walk through the physics</p>
  <h1>EEG primer: the physics of a non-invasive BCI</h1>`;
const standfirst = document.createElement('div');
standfirst.className = 'standfirst';
standfirst.innerHTML = `<p>Scalp electroencephalography (EEG) listens to the brain from the far side of a
  resistive bone, through fluid that shorts the signal sideways and skin that adds noise of its own. Nine
  models with sliders show why one neuron is invisible from outside, what it takes for a population to be
  seen, how much the head attenuates and blurs, how patches of cortex blur together from outside, how noise and
  electrodes intervene, how many independent signals a non-invasive brain\u2013computer interface (BCI) can hope
  to control, why every one of them arrives late, and how little more electrodes add. Every number carries a
  citation, and every citation was checked by an independent auditor (see the verification log).</p>`;
hero.append(inDepth(standfirst));
const toc = document.createElement('nav');
toc.className = 'toc';
toc.setAttribute('aria-label', 'Sections');
toc.innerHTML = `
    <a href="#neuron"><b>1</b> Neurons make very small electric fields</a>
    <a href="#population"><b>2</b> Many neurons must fire synchronously to create larger signal</a>
    <a href="#head"><b>3</b> Only large, multi-neuron signals reach outside the skull</a>
    <a href="#blur"><b>4</b> From outside, patches of cortex blur into broad blobs</a>
    <a href="#noise"><b>5</b> The signal that gets outside the skull is noisy</a>
    <a href="#electrodes"><b>6</b> Different electrode types result in different signals</a>
    <a href="#dimensions"><b>7</b> A head with EEG can operate only a few dimensions</a>
    <a href="#delay"><b>8</b> EEG signals have inherent delays</a>
    <a href="#count"><b>9</b> Adding electrodes gives diminishing returns</a>
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
mountSynchrony(main);
mountNoise(main);
mountElectrodes(main);
mountDimensions(main);
mountDelay(main);
mountCount(main);
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
