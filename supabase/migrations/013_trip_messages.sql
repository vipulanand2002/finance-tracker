CREATE TABLE trip_messages (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id      uuid REFERENCES trips(id) ON DELETE CASCADE,
  user_id      uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  sender_email text NOT NULL,
  content      text NOT NULL,
  created_at   timestamptz DEFAULT now()
);

ALTER TABLE trip_messages ENABLE ROW LEVEL SECURITY;

-- Trip owner + trip members (by email) can read messages
CREATE POLICY "trip participants can read messages" ON trip_messages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM trips t
      WHERE t.id = trip_messages.trip_id
      AND (
        t.user_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM trip_members tm
          WHERE tm.trip_id = t.id AND tm.email = auth.email()
        )
      )
    )
  );

-- Trip owner + trip members can send messages (user_id must match sender)
CREATE POLICY "trip participants can send messages" ON trip_messages
  FOR INSERT WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM trips t
      WHERE t.id = trip_messages.trip_id
      AND (
        t.user_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM trip_members tm
          WHERE tm.trip_id = t.id AND tm.email = auth.email()
        )
      )
    )
  );

-- Enable Realtime for live chat updates
ALTER PUBLICATION supabase_realtime ADD TABLE trip_messages;
