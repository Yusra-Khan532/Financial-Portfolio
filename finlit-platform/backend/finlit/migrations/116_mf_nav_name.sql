-- Task #256: AMFI's scheme master gives each scheme code its full "Scheme NAV Name" ("HSBC Small Cap Fund - Direct Growth"). AMFI's daily NAV file leaves
-- the Plan and Option columns blank for some fund houses (ICICI, UTI, Kotak, HSBC, ...) and names those schemes only "HSBC Small Cap Fund", so their plan and
-- option read "not stated" and their returns, chart and score were withheld. The master's name is kept here and read when the NAV file states neither.
ALTER TABLE mf_facts ADD COLUMN IF NOT EXISTS nav_name text;
