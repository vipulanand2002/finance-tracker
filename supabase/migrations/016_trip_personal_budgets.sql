CREATE TABLE trip_personal_budgets (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id    uuid REFERENCES trips(id) ON DELETE CASCADE,
  user_id    uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  user_email text NOT NULL,
  amount     numeric(12,2) NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(trip_id, user_id)
);

ALTER TABLE trip_personal_budgets ENABLE ROW LEVEL SECURITY;

-- Each user fully manages their own row
CREATE POLICY "users own personal budget" ON trip_personal_budgets
  FOR ALL USING (auth.uid() = user_id);

-- All trip participants can VIEW everyone's personal budgets
CREATE POLICY "trip participants view personal budgets" ON trip_personal_budgets
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM trips WHERE id = trip_id AND user_id = auth.uid())
    OR is_trip_member(trip_id)
  );
