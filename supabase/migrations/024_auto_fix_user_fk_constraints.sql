-- Auto-fix: finds every FK in the public schema pointing to auth.users
-- that still has NO ACTION (the default, which blocks user deletion),
-- then switches it to SET NULL (nullable columns) or CASCADE (non-nullable).
DO $$
DECLARE
  r            RECORD;
  col_nullable text;
  action       text;
BEGIN
  FOR r IN
    SELECT
      tc.table_name,
      kcu.column_name,
      tc.constraint_name,
      rc.delete_rule
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name
     AND tc.table_schema    = kcu.table_schema
    JOIN information_schema.referential_constraints rc
      ON tc.constraint_name = rc.constraint_name
    JOIN information_schema.key_column_usage kcu2
      ON rc.unique_constraint_name       = kcu2.constraint_name
     AND kcu2.ordinal_position           = kcu.position_in_unique_constraint
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND tc.table_schema    = 'public'
      AND kcu2.table_schema  = 'auth'
      AND kcu2.table_name    = 'users'
      AND rc.delete_rule     = 'NO ACTION'
  LOOP
    SELECT is_nullable INTO col_nullable
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = r.table_name
      AND column_name  = r.column_name;

    action := CASE WHEN col_nullable = 'YES' THEN 'SET NULL' ELSE 'CASCADE' END;

    RAISE NOTICE 'Fixing constraint % on %.% → ON DELETE %',
      r.constraint_name, r.table_name, r.column_name, action;

    EXECUTE format(
      'ALTER TABLE public.%I DROP CONSTRAINT %I',
      r.table_name, r.constraint_name
    );
    EXECUTE format(
      'ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES auth.users(id) ON DELETE %s',
      r.table_name, r.constraint_name, r.column_name, action
    );
  END LOOP;

  RAISE NOTICE 'Done. All public FK references to auth.users now have CASCADE or SET NULL.';
END $$;
