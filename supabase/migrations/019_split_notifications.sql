-- 1. Update is_split_participant to also match by email
--    (participants are often added by email without a user_id)
CREATE OR REPLACE FUNCTION is_split_participant(p_split_id uuid)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM split_participants
    WHERE split_id = p_split_id
      AND (participant_user_id = auth.uid() OR participant_email = auth.email())
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- 2. Update split_participant_rows to allow email-matched participants to view their rows
DROP POLICY IF EXISTS "split_participant_rows" ON split_participants;
CREATE POLICY "split_participant_rows" ON split_participants
  FOR ALL USING (
    is_split_creator(split_id)
    OR participant_user_id = auth.uid()
    OR participant_email = auth.email()
  )
  WITH CHECK (
    is_split_creator(split_id)
  );

-- 3. Notification table for split additions
CREATE TABLE split_notifications (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  split_id      uuid REFERENCES expense_splits(id) ON DELETE CASCADE,
  split_title   text NOT NULL,
  total_amount  numeric(12,2) NOT NULL,
  creator_email text NOT NULL,
  invitee_email text NOT NULL,
  amount_owed   numeric(12,2),
  dismissed     boolean NOT NULL DEFAULT false,
  created_at    timestamptz DEFAULT now()
);

ALTER TABLE split_notifications ENABLE ROW LEVEL SECURITY;

-- Creator can read/delete the notifications they sent
CREATE POLICY "split_notif_creator" ON split_notifications
  FOR ALL USING (creator_email = auth.email());

-- Invitee can read their own notifications
CREATE POLICY "split_notif_invitee_select" ON split_notifications
  FOR SELECT USING (invitee_email = auth.email());

-- Invitee can dismiss (update dismissed flag)
CREATE POLICY "split_notif_invitee_update" ON split_notifications
  FOR UPDATE USING (invitee_email = auth.email())
  WITH CHECK (invitee_email = auth.email());

-- Enable Realtime so invitees get live notifications
ALTER PUBLICATION supabase_realtime ADD TABLE split_notifications;
