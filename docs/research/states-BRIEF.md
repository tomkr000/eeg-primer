# Research brief: section 12, "named brain states"

You are a literature researcher for a website about the physical limits of scalp EEG. The site is adding a section on
the "brain states" that EEG studies and consumer products claim to read (workload, focus, relaxation, drowsiness,
emotions, meditation, sleep stages, anesthesia depth and so on). The site will model each state as a set of changes in
band power at a few cortical regions, read from one short window of EEG. Every number on the site must come from a
cited source that an independent auditor can open, so your job is to find PRIMARY, QUANTITATIVE sources: numbers with
their conditions (how many subjects, which electrodes, which band, relative to what baseline, window length).

Rules
- Do not use any personal data of the user in any request (no names, e-mail addresses or account details in queries,
  headers or payloads). Use WebSearch, WebFetch and curl only to public pages.
- Prefer open-access full texts. PubMed/PMC pages are often blocked by CAPTCHA here; these usually work instead:
  Europe PMC REST API via curl, e.g.
    curl -s "https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=DOI:10.1016/j.clinph.2007.06.005&format=json&resultType=core"
    curl -s "https://www.ebi.ac.uk/europepmc/webservices/rest/PMC6708046/fullTextXML"
  bioRxiv, Frontiers, MDPI, PLOS, eLife, eNeuro, journal landing pages. Semantic Scholar's API
  (https://api.semanticscholar.org/graph/v1/paper/DOI:...?fields=title,year,venue,abstract,openAccessPdf) finds
  open PDFs; download PDFs with curl and read them with pdftotext.
- For each number record WHERE it is (abstract, section, table, figure) and quote at most 20 verbatim words.
- Report bibliographic details exactly as on the source: authors (surname + initials), year, title, journal,
  volume(issue):pages, DOI. The site's bibliography needs them.
- Distinguish within-subject changes (same people, two conditions) from between-group differences. Record the
  baseline each change is relative to (eyes-open rest, eyes-closed rest, a low-load task, ...), and whether the number
  is a power ratio, a percentage change, dB, or a log value. Convert nothing: report the number as printed.
- When several studies disagree, report two or three and say which is the strongest (most subjects, clearest
  conditions, most cited). A review or meta-analysis that tabulates values is ideal; still name the primary study.
- Do not read other files under docs/research (other agents' notes); work only from your task file and the sources.
- Budget: at most 80 tool calls. Precision matters more than coverage, but every topic in your task needs an answer or
  an explicit "not found" with what you tried.

Output
Write a JSON array to the result path named in your task file, one object per finding:
{"topic": "<topic key from the task>", "finding": "<one or two sentences in your own words>",
 "numbers": "<the values as printed, with units and conditions>", "baseline": "<what the change is relative to>",
 "subjects": "<n and population>", "electrodes_band_window": "<sites, band in Hz, epoch length>",
 "source": {"authors": "...", "year": 2007, "title": "...", "venue": "...", "volumePages": "...", "doi": "..."},
 "evidence_location": "...", "quote": "<=20 words", "access": "full text|abstract|table only",
 "confidence": "high|medium|low", "caveats": "..."}
Then reply with a summary of at most 150 words: which topics have strong quantitative sources and which do not.
