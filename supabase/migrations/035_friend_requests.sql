-- Friend requests (pending → accepted | rejected)
CREATE TABLE IF NOT EXISTS friend_requests (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  to_user_id   uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  from_name    text NOT NULL DEFAULT '',
  from_email   text NOT NULL DEFAULT '',
  status       text NOT NULL DEFAULT 'pending'
               CHECK (status IN ('pending', 'accepted', 'rejected')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  responded_at timestamptz,
  UNIQUE(from_user_id, to_user_id)
);

ALTER TABLE friend_requests ENABLE ROW LEVEL SECURITY;

-- Sender: can insert + view their outgoing requests
CREATE POLICY "fr_sender_insert" ON friend_requests
  FOR INSERT WITH CHECK (auth.uid() = from_user_id);

CREATE POLICY "fr_sender_select" ON friend_requests
  FOR SELECT USING (auth.uid() = from_user_id);

-- Receiver: can view + update (accept/reject) incoming requests
CREATE POLICY "fr_receiver_select" ON friend_requests
  FOR SELECT USING (auth.uid() = to_user_id);

CREATE POLICY "fr_receiver_update" ON friend_requests
  FOR UPDATE USING (auth.uid() = to_user_id)
  WITH CHECK (auth.uid() = to_user_id);

ALTER PUBLICATION supabase_realtime ADD TABLE friend_requests;

-- ─── Notifications (for response events: accepted / rejected) ────────────────
CREATE TABLE IF NOT EXISTS notifications (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  type       text NOT NULL,
  data       jsonb NOT NULL DEFAULT '{}',
  read       boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notif_owner" ON notifications
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
