-- IPO grey market premium against the actual listing (the IPO calendar's "What GMP said vs what actually listed"). One row per IPO, read from InvestorGain's
-- GMP page of that issue by `refresh-ipo-gmp` (finlit/ipogmp.py): the last GMP before listing, the issue and listing prices, the subscription and the
-- day-by-day GMP log. GMP is an unofficial grey-market figure, shown as InvestorGain recorded it, with their name and a link.
CREATE TABLE IF NOT EXISTS ipo_gmp (
    ig_id          integer     PRIMARY KEY,            -- InvestorGain's IPO id (the number in the page address)
    url            text        NOT NULL,
    name           text        NOT NULL,
    nse            text,
    bse            text,
    isin           text,
    board          text        NOT NULL CHECK (board IN ('mainboard', 'sme')),
    sector         text,
    issue_price    numeric(12,2) NOT NULL,
    listing_price  numeric(12,2),                     -- the listing-day open the exchange set; null until the issue lists
    listing_date   date,
    subscription   numeric(10,2),                     -- times subscribed, overall
    issue_size_cr  numeric(14,2),
    gmp            numeric(12,2),                     -- the last GMP InvestorGain recorded before listing, in rupees
    gmp_pct        numeric(8,2),                      -- that GMP as a percent of the issue price
    listing_pct    numeric(8,2),                      -- the listing price against the issue price, percent
    listed         boolean     NOT NULL DEFAULT false,
    history        jsonb       NOT NULL DEFAULT '[]'::jsonb,
    fetched_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ipo_gmp_listed_idx ON ipo_gmp (listed, listing_date DESC);
