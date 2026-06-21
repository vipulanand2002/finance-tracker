-- Direct messages between friends (includes auto-posted split cards)
CREATE TABLE messages (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id   uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  receiver_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content     text NOT NULL,
  type        text NOT NULL DEFAULT 'text' CHECK (type IN ('text', 'split')),
  split_id    uuid REFERENCES expense_splits(id) ON DELETE SET NULL,
  created_at  timestamptz DEFAULT now()
);

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- Users can read messages they sent or received
CREATE POLICY "users see own messages" ON messages
  FOR SELECT USING (auth.uid() = sender_id OR auth.uid() = receiver_id);

-- Users can only insert messages where they are the sender
CREATE POLICY "users send messages" ON messages
  FOR INSERT WITH CHECK (auth.uid() = sender_id);

-- Service role can insert split-type messages on behalf of any user
-- (handled via SUPABASE_SERVICE_ROLE_KEY in API routes, bypasses RLS)

-- Enable Supabase Realtime so chat updates appear instantly
ALTER PUBLICATION supabase_realtime ADD TABLE messages;
