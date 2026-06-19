-- Members/participants of a trip (for quick split population)
CREATE TABLE IF NOT EXISTS trip_members (
  id      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid REFERENCES trips(id) ON DELETE CASCADE NOT NULL,
  email   text NOT NULL,
  name    text,
  UNIQUE(trip_id, email)
);

ALTER TABLE trip_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_own_trip_members" ON trip_members
  FOR ALL
  USING  (trip_id IN (SELECT id FROM trips WHERE user_id = auth.uid()))
  WITH CHECK (trip_id IN (SELECT id FROM trips WHERE user_id = auth.uid()));
