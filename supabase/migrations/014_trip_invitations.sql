-- Unique constraint on trip_members so trigger can use ON CONFLICT
CREATE UNIQUE INDEX IF NOT EXISTS trip_members_trip_email_idx ON trip_members(trip_id, email);

CREATE TABLE trip_invitations (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id       uuid REFERENCES trips(id) ON DELETE CASCADE,
  trip_name     text NOT NULL,
  inviter_id    uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  inviter_email text NOT NULL,
  invitee_email text NOT NULL,
  invitee_name  text,
  status        text NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'accepted', 'declined')),
  created_at    timestamptz DEFAULT now(),
  responded_at  timestamptz,
  UNIQUE(trip_id, invitee_email)
);

ALTER TABLE trip_invitations ENABLE ROW LEVEL SECURITY;

-- Inviter can create and see their invitations
CREATE POLICY "inviters manage invitations" ON trip_invitations
  FOR ALL USING (inviter_id = auth.uid());

-- Invitee can see invitations addressed to them
CREATE POLICY "invitees read invitations" ON trip_invitations
  FOR SELECT USING (invitee_email = auth.email());

-- Invitee can only update status to accepted or declined
CREATE POLICY "invitees respond to invitations" ON trip_invitations
  FOR UPDATE USING (invitee_email = auth.email())
  WITH CHECK (invitee_email = auth.email() AND status IN ('accepted', 'declined'));

-- Trigger: auto-add to trip_members when invitation is accepted
CREATE OR REPLACE FUNCTION handle_trip_invitation_accepted()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'accepted' AND OLD.status = 'pending' THEN
    INSERT INTO trip_members (trip_id, email, name)
    VALUES (NEW.trip_id, NEW.invitee_email, NEW.invitee_name)
    ON CONFLICT (trip_id, email) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_trip_invitation_accepted
AFTER UPDATE ON trip_invitations
FOR EACH ROW EXECUTE FUNCTION handle_trip_invitation_accepted();

-- Enable Realtime so invitees get live notifications
ALTER PUBLICATION supabase_realtime ADD TABLE trip_invitations;
