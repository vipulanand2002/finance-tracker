CREATE TABLE IF NOT EXISTS user_gmail_tokens (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  access_token  text NOT NULL,
  refresh_token text,
  token_expiry  timestamptz,
  gmail_address text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE user_gmail_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own_gmail_tokens" ON user_gmail_tokens
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
