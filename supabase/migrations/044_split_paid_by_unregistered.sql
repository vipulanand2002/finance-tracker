-- Allow a split's payer (creditor) to be an unregistered contact — someone with
-- an email but no account — so on-behalf expenses can be logged for them.
-- When paid_by (a user_id) is null, these carry the payer's identity instead.
ALTER TABLE expense_splits ADD COLUMN IF NOT EXISTS paid_by_email text;
ALTER TABLE expense_splits ADD COLUMN IF NOT EXISTS paid_by_name  text;
