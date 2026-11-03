export interface Reference {
  key: string;
  authors: string;
  year: number;
  title: string;
  venue: string;
  volumePages?: string;
  doi?: string;
  url?: string;
  /** short label for tooltips, e.g. "Henze et al. 2000" */
  short: string;
}

export type ClaimStatus =
  | 'verified' // independent checker opened the source and confirmed the statement
  | 'partially' // source supports the gist but with a nuance recorded in `note`
  | 'unverified' // could not be checked against the source text (e.g. paywalled)
  | 'derived' // follows from the model + verified inputs; not itself a literature claim
  | 'assumption'; // a modelling choice; stated explicitly, no literature value exists

export interface Claim {
  id: string;
  section: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;
  statement: string;
  value?: number;
  units?: string;
  range?: [number, number];
  refs: string[];
  status: ClaimStatus;
  /** verification notes (who checked, what they found) */
  note?: string;
}
