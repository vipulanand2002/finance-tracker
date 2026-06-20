-- Permanent fix: split_participants.participant_user_id had no ON DELETE rule.
-- Without this, deleting ANY user who appears as a split participant blocks deletion.
-- ON DELETE SET NULL keeps the participant row (name/amount intact) but unlinks the account.
ALTER TABLE split_participants
  DROP CONSTRAINT IF EXISTS split_participants_participant_user_id_fkey;

ALTER TABLE split_participants
  ADD CONSTRAINT split_participants_participant_user_id_fkey
    FOREIGN KEY (participant_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

-- Verification: after running this, all FK references to auth.users
-- should have either CASCADE or SET NULL as their delete rule.
-- Run this query to confirm (expect NO rows with delete_rule = 'NO ACTION'):
--
-- SELECT tc.table_name, kcu.column_name, rc.delete_rule
-- FROM information_schema.table_constraints tc
-- JOIN information_schema.key_column_usage kcu
--   ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
-- JOIN information_schema.referential_constraints rc
--   ON tc.constraint_name = rc.constraint_name
-- JOIN information_schema.key_column_usage kcu2
--   ON rc.unique_constraint_name = kcu2.constraint_name
--   AND kcu2.ordinal_position = kcu.position_in_unique_constraint
-- WHERE tc.constraint_type = 'FOREIGN KEY'
--   AND kcu2.table_schema = 'auth' AND kcu2.table_name = 'users'
-- ORDER BY tc.table_name;
