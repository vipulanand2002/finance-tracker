-- Allow participants to see splits even when participant_user_id wasn't set at creation time,
-- by also matching on their auth email.
CREATE OR REPLACE FUNCTION is_split_participant(p_split_id uuid)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM split_participants sp
    WHERE sp.split_id = p_split_id
      AND (
        sp.participant_user_id = auth.uid()
        OR (
          sp.participant_email IS NOT NULL
          AND sp.participant_email = (SELECT email FROM auth.users WHERE id = auth.uid())
        )
      )
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;
