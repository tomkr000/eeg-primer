Read docs/audit/BRIEF.md first: the same rules apply (adversarial check of every claim against its cited sources, verdicts SUPPORTED / PARTIAL / NOT_SUPPORTED / NO_ACCESS, quotes of at most 20 words, bibliographic checks, JSON output). Additional notes for this batch:
- Do not use any personal data of the user in any request.
- Each claim object carries `note_for_auditor` with where the numbers live and `status_on_site`; derived and assumption claims need the arithmetic and attributions checked, not a literature search.
- For claims with status `unverified`, say which verdict the site should set (verified / partially) and give the corrected statement if any number or attribution is off.
- Budget: at most 70 tool calls. Write the JSON array to docs/audit/result-<N>.json (relative to /home/claude/eeg-primer-states) and reply with a summary of at most 120 words.
