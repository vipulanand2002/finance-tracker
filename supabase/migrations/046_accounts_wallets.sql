-- Wallets & other accounts: Amazon Pay, MobiKwik, Paytm, PhonePe wallets, bank
-- accounts, cash, meal cards… Each account has an opening balance; its current
-- balance is derived from what's recorded against it:
--   opening_balance + income − expenses (transactions.account_id)
--                   + transfers in − transfers out (account_transfers)
-- Transfers (top-ups, withdrawals, moving money between accounts) are NOT income
-- or expenses — they never appear in transaction totals.
CREATE TABLE IF NOT EXISTS accounts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name            text NOT NULL,
  kind            text NOT NULL DEFAULT 'wallet' CHECK (kind IN ('wallet', 'bank', 'cash', 'other')),
  provider        text,                               -- key from lib/wallet-providers.ts, e.g. 'amazon_pay'
  opening_balance numeric(12,2) NOT NULL DEFAULT 0,
  color           text,
  notes           text,
  is_archived     boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_accounts_user_id ON accounts(user_id);

ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_own_accounts" ON accounts;
CREATE POLICY "users_own_accounts" ON accounts
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Which account a transaction was paid from / received into
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS account_id uuid REFERENCES accounts(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_transactions_account_id ON transactions(account_id);

-- Money moved into, out of, or between accounts. A NULL side means money from /
-- to somewhere that isn't tracked (e.g. topping up a wallet from an untracked bank).
CREATE TABLE IF NOT EXISTS account_transfers (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  from_account_id uuid REFERENCES accounts(id) ON DELETE CASCADE,
  to_account_id   uuid REFERENCES accounts(id) ON DELETE CASCADE,
  amount          numeric(12,2) NOT NULL CHECK (amount > 0),
  date            date NOT NULL DEFAULT current_date,
  note            text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CHECK (from_account_id IS NOT NULL OR to_account_id IS NOT NULL),
  CHECK (from_account_id IS DISTINCT FROM to_account_id)
);

CREATE INDEX IF NOT EXISTS idx_account_transfers_user ON account_transfers(user_id, date DESC);

ALTER TABLE account_transfers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_own_account_transfers" ON account_transfers;
CREATE POLICY "users_own_account_transfers" ON account_transfers
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
