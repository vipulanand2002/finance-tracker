-- Accounts are now identified by AI from the name the user types, so we store what
-- was identified: the brand / bank name and the website domain used to fetch its logo.
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS institution text;   -- e.g. 'HDFC Bank', 'Amazon Pay'
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS logo_domain text;   -- e.g. 'hdfcbank.com'
