-- Migration: Auto-confirm match when 4 players are set (accepted or maybe)
-- Date: 2026-01-17

CREATE OR REPLACE FUNCTION auto_confirm_match_when_full()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status TEXT;
  v_count INTEGER;
BEGIN
  IF NEW.match_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT status INTO v_status
  FROM matches
  WHERE id = NEW.match_id;

  IF v_status = 'confirmed' THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*)
  INTO v_count
  FROM match_rsvps
  WHERE match_id = NEW.match_id
    AND status::text IN ('accepted', 'maybe');

  -- Confirm only when exactly 4 players are set
  IF v_count = 4 THEN
    UPDATE match_rsvps
    SET status = 'accepted'
    WHERE match_id = NEW.match_id;

    UPDATE matches
    SET status = 'confirmed'
    WHERE id = NEW.match_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_confirm_match_when_full ON match_rsvps;

CREATE TRIGGER trg_auto_confirm_match_when_full
AFTER INSERT OR UPDATE OF status ON match_rsvps
FOR EACH ROW
EXECUTE FUNCTION auto_confirm_match_when_full();
