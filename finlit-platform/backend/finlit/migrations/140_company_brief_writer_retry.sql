-- Task #328 (24 Nov 2026): the company brief's writing attempts are now told apart: failed_writer (the writing service did not answer; not counted toward the
-- attempts), failed_cutoff (the answer stopped at its length limit, also when asked again with fewer pages), failed_output (the answer could not be read as
-- JSON), failed_noparts (it held none of the brief's parts) and failed_checks (a rewrite of an existing brief that did not pass). Before this, all of them were
-- recorded as failed_output, a cut-off answer included (a thinking model spent the output budget on thinking with a long annual report).
-- One-off: every company left as failed_output is tried again on the next run, with the shorter answer budget for thinking and the retry with fewer pages.
UPDATE company_brief_sources SET attempts = 0, last_tried_at = NULL WHERE last_state = 'failed_output';
