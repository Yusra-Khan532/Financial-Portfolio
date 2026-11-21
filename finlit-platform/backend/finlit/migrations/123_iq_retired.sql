-- Task #283 PR D (21 Nov 2026): FinLit IQ is retired and FinLit Prism is FinLit's only company score. Members' saved items on the retired score are
-- converted once (finlit/iq_retire.py, run by Store.migrate after these files and recorded in schema_migrations as iq_retire.VERSION). Each converted
-- item keeps what it was, so the pages and the one notice can say it was converted (the two scores' scales differ):
--   converted      {"on": "2026-11-21", "was": ["<old rule> → <new rule>", ...], "text": "<the sentence the page shows>"}
--   paused_reason  why the conversion paused an alert (a part of the retired score has no FinLit Prism twin); the alert is kept, never deleted
ALTER TABLE alerts ADD COLUMN IF NOT EXISTS converted jsonb;
ALTER TABLE alerts ADD COLUMN IF NOT EXISTS paused_reason text;
ALTER TABLE query_baskets ADD COLUMN IF NOT EXISTS converted jsonb;
