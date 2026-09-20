-- Add a second receipt/attachment slot to expense_splits
ALTER TABLE expense_splits ADD COLUMN IF NOT EXISTS receipt_url_2 text;
