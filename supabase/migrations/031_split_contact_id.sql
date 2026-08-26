-- Link splits to a contact so the contact detail page can surface them
ALTER TABLE expense_splits ADD COLUMN IF NOT EXISTS contact_id uuid REFERENCES contacts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS expense_splits_contact_id_idx ON expense_splits(contact_id);
