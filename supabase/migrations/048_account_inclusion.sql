-- Per-account switches for what counts where:
--   include_in_total    → the account's balance/transactions count in the overall
--                         total balance (dashboard all-time net + Wallets total)
--   include_in_spending → its income & expenses count in monthly totals, charts
--                         and budgets
-- Examples: Amazon Pay = spending ON, total OFF · a bank account you only track
-- on the side = both OFF.
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS include_in_total    boolean NOT NULL DEFAULT true;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS include_in_spending boolean NOT NULL DEFAULT true;
