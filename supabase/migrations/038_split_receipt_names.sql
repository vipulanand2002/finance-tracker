-- Optional display names for the two attachment slots
ALTER TABLE expense_splits ADD COLUMN IF NOT EXISTS receipt_name text;
ALTER TABLE expense_splits ADD COLUMN IF NOT EXISTS receipt_name_2 text;
