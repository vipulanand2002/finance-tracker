-- Admin-only bug notebook: things noticed in the app that still need fixing.
CREATE TABLE IF NOT EXISTS admin_bugs (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title      text NOT NULL,
  details    text,
  severity   text NOT NULL DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high')),
  status     text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'fixed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  fixed_at   timestamptz
);

CREATE INDEX IF NOT EXISTS admin_bugs_user_status_idx ON admin_bugs (user_id, status, created_at DESC);

ALTER TABLE admin_bugs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_bugs_owner_all" ON admin_bugs;
CREATE POLICY "admin_bugs_owner_all" ON admin_bugs
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
