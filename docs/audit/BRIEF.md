You are an independent, adversarial fact-checker. A website about the physical limits of scalp EEG makes the claims listed in your batch file, each with the source(s) it cites. Your job is to find errors: numbers that are wrong, statements the source does not actually make, misattributed findings, wrong bibliographic details (authors/year/journal/volume/DOI), or nuances the claim drops. Assume every claim may be wrong until you have seen the supporting text yourself.

Rules
- For EVERY claim: locate the cited source (WebSearch the title/DOI, then WebFetch the page). Full text where possible; otherwise the abstract. PubMed/PMC pages are often blocked by CAPTCHA in this environment; these usually work instead: Europe PMC REST API via Bash curl, e.g.
    curl -s "https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=DOI:10.1152/jn.2000.84.1.390&format=json&resultType=core"
    curl -s "https://www.ebi.ac.uk/europepmc/webservices/rest/PMC6708046/fullTextXML"
  bioRxiv/arXiv full texts, Frontiers, MDPI, PLOS, eLife, journal landing pages, bem.fi (Malmivuo & Plonsey book, use http:// with curl if https redirects loop), ti.com datasheets (PDF: download with curl and read with pdftotext).
- Check the NUMBERS and the SPECIFIC wording of each claim against the source, not just the topic. If a claim cites several sources, check which source supports which part.
- Verdicts: SUPPORTED (every number/statement found in the source), PARTIAL (gist supported but a number, condition or attribution differs — say exactly how), NOT_SUPPORTED (source says something different or does not contain the statement), NO_ACCESS (could not open any text containing the statement; say what you could see).
- Record where the evidence is (abstract / section / page / table / figure) and quote at most 20 verbatim words per claim.
- Also check bibliographic details against what you see (e.g., a DOI that does not resolve, wrong journal or volume) and report mismatches.
- Do NOT read any other file under /home/claude/research (other agents' notes); work only from your batch file and the sources. Budget: ≤ 70 tool calls. Do not pad; precision matters more than coverage, but every claim needs a verdict.

Output: write a JSON array to the result path named in your instructions, one object per claim:
{"id": "...", "verdict": "SUPPORTED|PARTIAL|NOT_SUPPORTED|NO_ACCESS", "checked_sources": ["which sources you actually opened"], "evidence_location": "...", "quote": "<=20 words", "discrepancy": "exact difference if any, else empty", "suggested_fix": "corrected wording/number if needed", "bibliographic_issues": "..."}
Then reply with a <=120-word summary: counts per verdict and the most important discrepancies.
