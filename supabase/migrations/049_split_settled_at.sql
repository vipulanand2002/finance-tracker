-- When a split was settled. Used to clear old settled splits after 6 months
-- (/api/cron/cleanup-splits). Splits that belong to a trip are never cleared.
ALTER TABLE expense_splits ADD COLUMN IF NOT EXISTS settled_at timestamptz;

-- Splits that are already settled don't have a real date, so each gets a fresh
-- 6-month window from today instead of being cleared straight away.
UPDATE expense_splits SET settled_at = now() WHERE is_settled = true AND settled_at IS NULL;

CREATE INDEX IF NOT EXISTS expense_splits_settled_at_idx ON expense_splits (settled_at) WHERE is_settled = true;
