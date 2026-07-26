-- User-defined custom categories (expense / income)
CREATE TABLE user_categories (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name       text NOT NULL,
  list_type  text NOT NULL CHECK (list_type IN ('expense', 'income')),
  created_at timestamptz DEFAULT now(),
  UNIQUE (user_id, name, list_type)
);

ALTER TABLE user_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users manage own categories" ON user_categories
  FOR ALL USING (auth.uid() = user_id);
