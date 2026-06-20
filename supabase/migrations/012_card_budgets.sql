CREATE TABLE card_budgets (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  card_id     uuid REFERENCES cards(id) ON DELETE CASCADE,
  category    text NOT NULL,
  amount      numeric(12,2) NOT NULL,
  month       int NOT NULL,
  year        int NOT NULL,
  created_at  timestamptz DEFAULT now(),
  UNIQUE(user_id, card_id, category, month, year)
);

ALTER TABLE card_budgets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users see own card budgets" ON card_budgets
  FOR ALL USING (auth.uid() = user_id);
