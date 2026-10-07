-- A settlement is an agreement between you and another person that the balance
-- between you is closed. It is NOT a payment: no income or expense is recorded,
-- because settling doesn't mean money changed hands (they may have paid, you may
-- have agreed to call it even, or each of you may owe the other).
--
-- Closing a balance writes one row here. Amounts recorded before settled_at belong
-- to that closed round and are no longer counted in the person's active balance.
CREATE TABLE IF NOT EXISTS settlements (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  person_key      text NOT NULL,                 -- 'e:<email>' or 'n:<name>' (same key the Balances page uses)
  person_name     text NOT NULL,
  person_email    text,
  contact_id      uuid REFERENCES contacts(id) ON DELETE SET NULL,
  settled_at      timestamptz NOT NULL DEFAULT now(),
  started_at      timestamptz,                   -- when this round began (earliest bill / entry)
  net_before      numeric NOT NULL DEFAULT 0,    -- outstanding when settled: + they owed you, - you owed them
  they_owed       numeric NOT NULL DEFAULT 0,    -- their shares on bills you paid (splits) that were closed
  you_owed        numeric NOT NULL DEFAULT 0,    -- your shares on bills they paid (splits) that were closed
  expenses        numeric NOT NULL DEFAULT 0,    -- tagged expenses covered
  received        numeric NOT NULL DEFAULT 0,    -- tagged income covered
  paid_to_them    numeric NOT NULL DEFAULT 0,
  charged_to_them numeric NOT NULL DEFAULT 0,
  share_count     integer NOT NULL DEFAULT 0,
  split_ids       uuid[]  NOT NULL DEFAULT '{}',
  note            text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS settlements_user_person_idx ON settlements (user_id, person_key, settled_at DESC);

ALTER TABLE settlements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "settlements_owner_all" ON settlements;
CREATE POLICY "settlements_owner_all" ON settlements
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
