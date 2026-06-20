-- SECURITY DEFINER functions break the mutual RLS reference between
-- expense_splits and split_participants (each table's policy queries the other).

CREATE OR REPLACE FUNCTION is_split_participant(p_split_id uuid)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM split_participants
    WHERE split_id = p_split_id AND participant_user_id = auth.uid()
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION is_split_creator(p_split_id uuid)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM expense_splits
    WHERE id = p_split_id AND created_by = auth.uid()
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- expense_splits: replace inline subquery with SECURITY DEFINER function
DROP POLICY IF EXISTS "split_participants_view" ON expense_splits;
CREATE POLICY "split_participants_view" ON expense_splits
  FOR SELECT USING (is_split_participant(id));

-- split_participants: replace inline subquery with SECURITY DEFINER function
DROP POLICY IF EXISTS "split_participant_rows" ON split_participants;
CREATE POLICY "split_participant_rows" ON split_participants
  FOR ALL USING (
    is_split_creator(split_id)
    OR participant_user_id = auth.uid()
  )
  WITH CHECK (
    is_split_creator(split_id)
  );
