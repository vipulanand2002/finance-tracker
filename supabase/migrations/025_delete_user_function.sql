-- Permanent admin helper: safely deletes a user and ALL their data,
-- including storage files (which block deletion if not removed first).
CREATE OR REPLACE FUNCTION public.delete_user_completely(target_user_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, storage
AS $$
DECLARE
  deleted_files int;
BEGIN
  -- Storage files owned by this user (receipt uploads, etc.)
  DELETE FROM storage.objects
  WHERE owner    = target_user_id
     OR owner_id = target_user_id::text;
  GET DIAGNOSTICS deleted_files = ROW_COUNT;

  -- Public schema rows in safe deletion order
  DELETE FROM card_budgets          WHERE user_id          = target_user_id;
  DELETE FROM trip_personal_budgets WHERE user_id          = target_user_id;
  DELETE FROM trip_messages         WHERE user_id          = target_user_id;
  DELETE FROM trip_invitations      WHERE inviter_id       = target_user_id;
  DELETE FROM split_participants    WHERE participant_user_id = target_user_id;
  DELETE FROM expense_splits        WHERE created_by       = target_user_id;
  DELETE FROM transactions          WHERE user_id          = target_user_id;
  DELETE FROM budgets               WHERE user_id          = target_user_id;
  DELETE FROM cards                 WHERE user_id          = target_user_id;
  DELETE FROM trips                 WHERE user_id          = target_user_id;
  DELETE FROM friendships           WHERE user_id          = target_user_id
                                       OR friend_id        = target_user_id;
  DELETE FROM profiles              WHERE id               = target_user_id;

  -- Auth user last (GoTrue handles sessions/identities/refresh_tokens automatically)
  DELETE FROM auth.users WHERE id = target_user_id;

  RETURN format('User %s deleted. Storage files removed: %s', target_user_id, deleted_files);
END;
$$;
