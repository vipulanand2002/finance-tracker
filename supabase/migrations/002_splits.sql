-- Expense splits (like Splitwise groups)
CREATE TABLE IF NOT EXISTS expense_splits (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by   uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  title        text NOT NULL,
  total_amount numeric(12,2) NOT NULL CHECK (total_amount > 0),
  category     text NOT NULL DEFAULT 'Other',
  description  text,
  date         date NOT NULL,
  is_settled   boolean NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- Participants in each split
CREATE TABLE IF NOT EXISTS split_participants (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  split_id            uuid REFERENCES expense_splits(id) ON DELETE CASCADE NOT NULL,
  participant_user_id uuid REFERENCES auth.users(id),
  participant_name    text NOT NULL,
  participant_email   text,
  amount_owed         numeric(12,2) NOT NULL CHECK (amount_owed >= 0),
  is_paid             boolean NOT NULL DEFAULT false,
  paid_at             timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_splits_created_by ON expense_splits(created_by);
CREATE INDEX IF NOT EXISTS idx_split_participants_split_id ON split_participants(split_id);
CREATE INDEX IF NOT EXISTS idx_split_participants_user_id ON split_participants(participant_user_id);

-- RLS
ALTER TABLE expense_splits ENABLE ROW LEVEL SECURITY;
ALTER TABLE split_participants ENABLE ROW LEVEL SECURITY;

-- Creators manage their own splits
CREATE POLICY "split_creators_all" ON expense_splits
  FOR ALL USING (auth.uid() = created_by)
  WITH CHECK (auth.uid() = created_by);

-- Linked users can view splits they're in
CREATE POLICY "split_participants_view" ON expense_splits
  FOR SELECT USING (
    id IN (SELECT split_id FROM split_participants WHERE participant_user_id = auth.uid())
  );

-- Participants policy (creator manages all rows; participants see their own row)
CREATE POLICY "split_participant_rows" ON split_participants
  FOR ALL USING (
    split_id IN (SELECT id FROM expense_splits WHERE created_by = auth.uid())
    OR participant_user_id = auth.uid()
  )
  WITH CHECK (
    split_id IN (SELECT id FROM expense_splits WHERE created_by = auth.uid())
  );
