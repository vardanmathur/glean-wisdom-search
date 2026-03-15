-- Drop unused columns from highlights table
-- These were Excel metadata fields not used in the Glean app
-- char_length reference removed from getAllBooks in data.ts before this migration

ALTER TABLE highlights DROP COLUMN IF EXISTS blogged;
ALTER TABLE highlights DROP COLUMN IF EXISTS char_length;
ALTER TABLE highlights DROP COLUMN IF EXISTS record_id;
ALTER TABLE highlights DROP COLUMN IF EXISTS location;
ALTER TABLE highlights DROP COLUMN IF EXISTS highlight_date;
