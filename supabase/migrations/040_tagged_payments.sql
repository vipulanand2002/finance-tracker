-- Cross-user "you paid me" records.
-- When user A logs an INCOME tagged to a contact who is a registered user (B),
-- a tagged_payment is created so B's app can see "A recorded you paid them ₹X",
-- reduce B's balance with A, and optionally let B add it to their own expenses.

CREATE TABLE IF NOT EXISTS tagged_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,  -- who received the money (logged income)
  from_name text,
  from_email text,
  to_email text NOT NULL,          -- the payer's email (the tagged friend)
  to_user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,  -- resolved payer account, if registered
  amount numeric NOT NULL,
  description text,
  date date NOT NULL DEFAULT current_date,
  transaction_id uuid,             -- source income transaction (for edit/delete sync)
  added_transaction_id uuid,       -- payer's expense transaction, once they add it
  status text NOT NULL DEFAULT 'pending',  -- pending | added | dismissed
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tagged_payments_to_email_idx ON tagged_payments (lower(to_email));
CREATE INDEX IF NOT EXISTS tagged_payments_to_user_idx ON tagged_payments (to_user_id);
CREATE INDEX IF NOT EXISTS tagged_payments_from_user_idx ON tagged_payments (from_user_id);
CREATE INDEX IF NOT EXISTS tagged_payments_transaction_idx ON tagged_payments (transaction_id);

ALTER TABLE tagged_payments ENABLE ROW LEVEL SECURITY;

-- Sender (from) or recipient (to, by id or email) can see the row.
DROP POLICY IF EXISTS tagged_payments_visible ON tagged_payments;
CREATE POLICY tagged_payments_visible ON tagged_payments
  FOR SELECT USING (
    from_user_id = auth.uid()
    OR to_user_id = auth.uid()
    OR lower(to_email) = lower(coalesce((auth.jwt() ->> 'email'), ''))
  );

-- Sender creates their own rows.
DROP POLICY IF EXISTS tagged_payments_insert ON tagged_payments;
CREATE POLICY tagged_payments_insert ON tagged_payments
  FOR INSERT WITH CHECK (from_user_id = auth.uid());

-- Sender may edit/delete their rows; recipient may update status (add/dismiss).
DROP POLICY IF EXISTS tagged_payments_update ON tagged_payments;
CREATE POLICY tagged_payments_update ON tagged_payments
  FOR UPDATE USING (
    from_user_id = auth.uid()
    OR to_user_id = auth.uid()
    OR lower(to_email) = lower(coalesce((auth.jwt() ->> 'email'), ''))
  );

DROP POLICY IF EXISTS tagged_payments_delete ON tagged_payments;
CREATE POLICY tagged_payments_delete ON tagged_payments
  FOR DELETE USING (from_user_id = auth.uid());
