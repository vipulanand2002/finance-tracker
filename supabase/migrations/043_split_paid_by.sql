-- Who actually paid the bill for a split (the creditor others owe), which can
-- differ from created_by (the author). For a normal split paid_by = creator;
-- for a split created on someone's behalf paid_by = that person.
-- NULL for legacy rows → treat as created_by.
ALTER TABLE expense_splits
  ADD COLUMN IF NOT EXISTS paid_by uuid;
