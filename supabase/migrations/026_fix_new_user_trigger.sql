-- Rewrite handle_new_user with explicit search_path and NULL-safe email.
-- Without SET search_path, SECURITY DEFINER functions can fail to resolve
-- the 'profiles' table if the caller's search_path doesn't include 'public'.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email)
  VALUES (NEW.id, COALESCE(NEW.email, ''))
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Log the real error so it appears in Supabase Auth logs
  RAISE LOG 'handle_new_user failed for user %: % (%)', NEW.id, SQLERRM, SQLSTATE;
  RETURN NEW; -- still allow the user to be created even if profile insert fails
END;
$$;
