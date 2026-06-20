-- Trip owner can hide the trip's total budget from members
ALTER TABLE trips ADD COLUMN IF NOT EXISTS budget_visible_to_members boolean DEFAULT true;

-- Members can mark their personal budget as private (hidden from others)
ALTER TABLE trip_personal_budgets ADD COLUMN IF NOT EXISTS is_private boolean DEFAULT false;

-- Update the VIEW policy so private personal budgets are invisible to other members.
-- The FOR ALL "users own personal budget" policy (user_id = auth.uid()) already lets
-- each user read their own private budget, so we only tighten the shared SELECT policy.
DROP POLICY IF EXISTS "trip participants view personal budgets" ON trip_personal_budgets;

CREATE POLICY "trip participants view personal budgets" ON trip_personal_budgets
  FOR SELECT USING (
    (
      EXISTS (SELECT 1 FROM trips WHERE id = trip_id AND user_id = auth.uid())
      OR is_trip_member(trip_id)
    )
    AND (
      (is_private IS NULL OR is_private = false)
      OR user_id = auth.uid()
    )
  );
