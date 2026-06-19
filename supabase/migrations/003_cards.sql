CREATE TABLE IF NOT EXISTS cards (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  card_name    text NOT NULL,
  bank_name    text NOT NULL,
  last_four    text NOT NULL CHECK (length(last_four) = 4),
  card_type    text NOT NULL CHECK (card_type IN ('credit', 'debit', 'prepaid')),
  network      text NOT NULL DEFAULT 'other' CHECK (network IN ('visa', 'mastercard', 'rupay', 'amex', 'other')),
  expiry_month int CHECK (expiry_month BETWEEN 1 AND 12),
  expiry_year  int CHECK (expiry_year >= 2024),
  holder_name  text,
  color                  text NOT NULL DEFAULT 'blue',
  logo_url               text,
  statement_sender_email text,
  created_at             timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE cards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own_cards" ON cards
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_cards_user_id ON cards(user_id);
