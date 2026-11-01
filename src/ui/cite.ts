import { REFERENCES, type Reference } from '../data/references';

const index = new Map<string, number>();
REFERENCES.forEach((r, i) => index.set(r.key, i + 1));

/** Inline citation marker(s) linking to the reference list, e.g. cite('henze2000', 'buzsaki2004'). */
export function cite(...keys: string[]): string {
  const parts = keys.map((k) => {
    const n = index.get(k);
    if (!n) { console.warn(`unknown reference key: ${k}`); return `<a class="cite-missing" href="#references">?</a>`; }
    return `<a href="#ref-${k}" title="${REFERENCES[n - 1].short}">${n}</a>`;
  });
  return `<sup class="cite">[${parts.join(',')}]</sup>`;
}

export function refNumber(key: string): number | undefined {
  return index.get(key);
}

export function formatReference(r: Reference): string {
  const link = r.doi ? `https://doi.org/${r.doi}` : r.url;
  const where = [r.venue, r.volumePages].filter(Boolean).join(' ');
  return `${r.authors} (${r.year}). ${r.title}. <i>${where}</i>.${link ? ` <a href="${link}" rel="noopener">${r.doi ? 'doi:' + r.doi : 'link'}</a>` : ''}`;
}
