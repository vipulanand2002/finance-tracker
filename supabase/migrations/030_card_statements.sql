CREATE TABLE card_statements (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  card_id     uuid REFERENCES cards(id) ON DELETE CASCADE,
  cycle_start date NOT NULL,
  cycle_end   date NOT NULL,
  created_at  timestamptz DEFAULT now(),
  UNIQUE(user_id, card_id, cycle_start, cycle_end)
);

ALTER TABLE card_statements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users see own card statements" ON card_statements
  FOR ALL USING (auth.uid() = user_id);
