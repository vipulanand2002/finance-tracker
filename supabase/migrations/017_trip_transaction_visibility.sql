-- Allow trip participants (owner + accepted members) to view all transactions
-- linked to trips they belong to. The existing "users see own transactions"
-- policy still covers each user's own transactions regardless of trip.
CREATE POLICY "trip participants view trip transactions" ON transactions
  FOR SELECT USING (
    trip_id IS NOT NULL AND (
      EXISTS (SELECT 1 FROM trips WHERE id = trip_id AND user_id = auth.uid())
      OR is_trip_member(trip_id)
    )
  );
