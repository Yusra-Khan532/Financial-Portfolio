-- Task #277 (All my investments, 20 Nov pack, change 19): the companies of "What changed at the companies you own", kept for the list alert
-- "All my investments". Written each time the page is worked out for all accounts: {"at": ISO time, "direct": [symbols], "through": [symbols]}, where
-- through = held only through funds and ETFs at 0.1% or more of everything. The nightly filing-alert run reads it (filingalerts.lists_of).
ALTER TABLE user_state ADD COLUMN IF NOT EXISTS invest_list jsonb;
