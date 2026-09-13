-- Add full_name, avatar_url, and avatar_public to profiles
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS full_name     text,
  ADD COLUMN IF NOT EXISTS avatar_url    text,
  ADD COLUMN IF NOT EXISTS avatar_public boolean NOT NULL DEFAULT false;

-- Backfill full_name from auth.users raw_user_meta_data for existing users
UPDATE profiles p
SET full_name = u.raw_user_meta_data->>'full_name'
FROM auth.users u
WHERE p.id = u.id
  AND p.full_name IS NULL
  AND u.raw_user_meta_data->>'full_name' IS NOT NULL;

-- Allow users to update their own profile row
DROP POLICY IF EXISTS "profiles_update" ON profiles;
CREATE POLICY "profiles_update" ON profiles
  FOR UPDATE USING (auth.uid() = id);

-- Update handle_new_user to also set full_name on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.email, ''),
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;
