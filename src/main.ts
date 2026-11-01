import './style.css';
import { mountNeuron } from './sections/s1-neuron';
import { mountPopulation } from './sections/s2-population';
import { mountHead } from './sections/s3-head';
import { mountNoise } from './sections/s4-noise';
import { mountElectrodes } from './sections/s5-electrodes';
import { mountDimensionality } from './sections/s6-dimensionality';
import { mountMethod, mountReferences, mountVerification } from './sections/s7-references';
import { claimById } from './data/claims';

const app = document.getElementById('app')!;

const hero = document.createElement('header');
hero.className = 'hero';
hero.innerHTML = `
  <p class="kicker">An interactive, cited walk through the physics</p>
  <h1>Through the skull, dimly</h1>
  <p class="standfirst">Scalp electroencephalography (EEG) records the brain from the far side of a
  resistive bone, through fluid that shorts the signal sideways and skin that adds its own noise.
  Six models with sliders show, number by number, why a single neuron is invisible from outside, what it
  takes for a population to be seen, how much the head attenuates and blurs, how noise and electrodes
  intervene, and how many independent signals a brain–machine interface (BMI) can hope to extract
  even with unlimited electrodes. Every assumption carries a citation; every citation was checked by an
  independent auditor (see the verification log).</p>
  <nav class="toc" aria-label="Sections">
    <a href="#neuron"><b>1</b> How far does one neuron’s signal reach?</a>
    <a href="#population"><b>2</b> Strength in numbers — but only in step</a>
    <a href="#head"><b>3</b> Out through CSF, dura, skull and scalp</a>
    <a href="#noise"><b>4</b> Noise from outside the skull</a>
    <a href="#electrodes"><b>5</b> What the electrode actually touches</a>
    <a href="#dimensionality"><b>6</b> How many independent signals can EEG carry?</a>
    <a href="#method">Method and caveats</a>
    <a href="#verification">Verification log</a>
    <a href="#references">References</a>
  </nav>`;
app.append(hero);

const main = document.createElement('main');
app.append(main);
mountNeuron(main);
mountPopulation(main);
mountHead(main);
mountNoise(main);
mountElectrodes(main);
mountDimensionality(main);
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
