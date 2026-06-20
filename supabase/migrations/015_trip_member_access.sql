-- SECURITY DEFINER function avoids RLS recursion when checking membership
CREATE OR REPLACE FUNCTION is_trip_member(p_trip_id uuid)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM trip_members
    WHERE trip_id = p_trip_id AND email = auth.email()
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Allow accepted members to READ trips (existing FOR ALL policy covers owners)
CREATE POLICY "members_can_view_trips" ON trips
  FOR SELECT USING (is_trip_member(id));

-- Allow members to read other members of their trips
CREATE POLICY "members_can_view_trip_members" ON trip_members
  FOR SELECT USING (is_trip_member(trip_id));

-- Allow members to read category budgets of their trips
CREATE POLICY "members_can_view_trip_budgets" ON trip_budgets
  FOR SELECT USING (is_trip_member(trip_id));
