-- Author of a transaction, when it differs from the owner (user_id).
-- Used for "add a transaction on behalf of a friend": the row is owned by the
-- friend (user_id = friend) but authored by the creator (created_by = me), and
-- only the author may edit/delete it. Cross-account writes go through a
-- service-role endpoint; the friend reads it via their normal (user_id) access.
ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS created_by uuid;
