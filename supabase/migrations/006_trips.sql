-- Trips
CREATE TABLE IF NOT EXISTS trips (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name          text NOT NULL,
  destination   text,
  description   text,
  start_date    date,
  end_date      date,
  image_url     text,
  budget_total  numeric(12,2),
  created_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE trips ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_own_trips" ON trips
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Per-category budgets per trip (optional)
CREATE TABLE IF NOT EXISTS trip_budgets (
  id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id  uuid REFERENCES trips(id) ON DELETE CASCADE NOT NULL,
  category text NOT NULL,
  amount   numeric(12,2) NOT NULL,
  UNIQUE(trip_id, category)
);

ALTER TABLE trip_budgets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_own_trip_budgets" ON trip_budgets
  FOR ALL
  USING (trip_id IN (SELECT id FROM trips WHERE user_id = auth.uid()))
  WITH CHECK (trip_id IN (SELECT id FROM trips WHERE user_id = auth.uid()));

-- Link transactions to a trip
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS trip_id uuid REFERENCES trips(id) ON DELETE SET NULL;

-- Link expense_splits to a trip
ALTER TABLE expense_splits ADD COLUMN IF NOT EXISTS trip_id uuid REFERENCES trips(id) ON DELETE SET NULL;

-- Storage bucket for trip cover images (public read)
INSERT INTO storage.buckets (id, name, public)
  VALUES ('trip-images', 'trip-images', true)
  ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "trip_images_insert" ON storage.objects;
DROP POLICY IF EXISTS "trip_images_select" ON storage.objects;
DROP POLICY IF EXISTS "trip_images_delete" ON storage.objects;

CREATE POLICY "trip_images_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'trip-images');

CREATE POLICY "trip_images_select" ON storage.objects
  FOR SELECT USING (bucket_id = 'trip-images');

CREATE POLICY "trip_images_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'trip-images' AND auth.uid()::text = (storage.foldername(name))[1]);
