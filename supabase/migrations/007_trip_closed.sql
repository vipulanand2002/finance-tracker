-- Add is_closed toggle to trips (run this if you already ran 006_trips.sql)
ALTER TABLE trips ADD COLUMN IF NOT EXISTS is_closed boolean NOT NULL DEFAULT false;
