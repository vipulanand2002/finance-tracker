-- Discrete expenses: visible only to the owner, excluded from trip totals

ALTER TABLE transactions ADD COLUMN IF NOT EXISTS is_discrete boolean DEFAULT false;

-- Update the trip-member visibility policy to exclude discrete transactions.
-- The base "users see own transactions" policy (FOR ALL) still lets owners see their own discrete rows.
-- Members simply never receive discrete rows from this query.
DROP POLICY IF EXISTS "trip participants view trip transactions" ON transactions;

CREATE POLICY "trip participants view trip transactions" ON transactions
  FOR SELECT USING (
    trip_id IS NOT NULL
    AND (is_discrete IS NULL OR is_discrete = false)
    AND (
      EXISTS (SELECT 1 FROM trips WHERE id = trip_id AND user_id = auth.uid())
      OR is_trip_member(trip_id)
    )
  );
