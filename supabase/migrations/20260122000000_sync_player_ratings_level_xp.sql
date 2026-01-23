-- Sync level/xp from rating on player_ratings
-- Ensures level/xp stay consistent when rating changes

CREATE OR REPLACE FUNCTION sync_player_ratings_level_xp()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  r numeric;
BEGIN
  r := GREATEST(0, LEAST(100, COALESCE(NEW.rating, 0)));

  IF r BETWEEN 0 AND 12.4 THEN
    NEW.level := 1;
    NEW.xp := ROUND(((r - 0.0) / (12.4 - 0.0)) * 100.0, 2);
  ELSIF r BETWEEN 12.5 AND 24.9 THEN
    NEW.level := 2;
    NEW.xp := ROUND(((r - 12.5) / (24.9 - 12.5)) * 100.0, 2);
  ELSIF r BETWEEN 25.0 AND 37.4 THEN
    NEW.level := 3;
    NEW.xp := ROUND(((r - 25.0) / (37.4 - 25.0)) * 100.0, 2);
  ELSIF r BETWEEN 37.5 AND 49.9 THEN
    NEW.level := 4;
    NEW.xp := ROUND(((r - 37.5) / (49.9 - 37.5)) * 100.0, 2);
  ELSIF r BETWEEN 50.0 AND 62.4 THEN
    NEW.level := 5;
    NEW.xp := ROUND(((r - 50.0) / (62.4 - 50.0)) * 100.0, 2);
  ELSIF r BETWEEN 62.5 AND 74.9 THEN
    NEW.level := 6;
    NEW.xp := ROUND(((r - 62.5) / (74.9 - 62.5)) * 100.0, 2);
  ELSIF r BETWEEN 75.0 AND 87.4 THEN
    NEW.level := 7;
    NEW.xp := ROUND(((r - 75.0) / (87.4 - 75.0)) * 100.0, 2);
  ELSE
    NEW.level := 8;
    NEW.xp := ROUND(((r - 87.5) / (100.0 - 87.5)) * 100.0, 2);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_sync_player_ratings_level_xp ON player_ratings;
CREATE TRIGGER trigger_sync_player_ratings_level_xp
BEFORE INSERT OR UPDATE OF rating
ON player_ratings
FOR EACH ROW
EXECUTE FUNCTION sync_player_ratings_level_xp();