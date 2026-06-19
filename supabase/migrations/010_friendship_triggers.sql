-- Auto-mirror friendship rows so both users see each other.
-- SECURITY DEFINER lets these run as the table owner, bypassing RLS.

CREATE OR REPLACE FUNCTION handle_friendship_insert()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO friendships (user_id, friend_id)
  VALUES (NEW.friend_id, NEW.user_id)
  ON CONFLICT (user_id, friend_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_friendship_created ON friendships;
CREATE TRIGGER on_friendship_created
  AFTER INSERT ON friendships
  FOR EACH ROW
  EXECUTE FUNCTION handle_friendship_insert();

-- Auto-remove the reverse row when a friendship is deleted.
CREATE OR REPLACE FUNCTION handle_friendship_delete()
RETURNS TRIGGER AS $$
BEGIN
  DELETE FROM friendships
  WHERE user_id = OLD.friend_id AND friend_id = OLD.user_id;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_friendship_deleted ON friendships;
CREATE TRIGGER on_friendship_deleted
  AFTER DELETE ON friendships
  FOR EACH ROW
  EXECUTE FUNCTION handle_friendship_delete();
