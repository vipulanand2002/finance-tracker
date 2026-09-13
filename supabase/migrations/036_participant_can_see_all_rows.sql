-- Allow any participant of a split to see ALL participant rows for that split.
-- Previously the policy only let each user see their own row.
-- Privacy filtering (hiding emails of non-friends) is handled in the application layer.
DROP POLICY IF EXISTS "split_participant_rows" ON split_participants;
CREATE POLICY "split_participant_rows" ON split_participants
  FOR ALL USING (
    is_split_creator(split_id)
    OR is_split_participant(split_id)
  )
  WITH CHECK (
    is_split_creator(split_id)
  );
