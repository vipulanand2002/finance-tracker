-- Add contact association columns to transactions (referenced in code but never migrated)
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS contact_id uuid REFERENCES contacts(id) ON DELETE SET NULL;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS contact_ids uuid[] DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_transactions_contact_id ON transactions(contact_id);
