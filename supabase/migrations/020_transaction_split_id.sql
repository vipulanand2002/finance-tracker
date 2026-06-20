-- Link auto-created split transactions back to the split
-- so personal budget calculations can exclude them from direct spending
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS split_id uuid REFERENCES expense_splits(id) ON DELETE SET NULL;
