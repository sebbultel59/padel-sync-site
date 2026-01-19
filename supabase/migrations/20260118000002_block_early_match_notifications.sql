-- Migration: Block immediate match creation notifications
-- Date: 2026-01-18
-- Goal: prevent notifications before the countdown confirmation

CREATE OR REPLACE FUNCTION block_early_match_notifications()
RETURNS TRIGGER AS $$
BEGIN
  -- Block automatic "match created" notifications; we send later after confirmation
  IF NEW.kind IN ('group_match_created', 'match_created', 'group_match_validated', 'match_confirmed', 'match_validated') THEN
    IF COALESCE(NEW.payload->>'allow_after_countdown', 'false') = 'true' THEN
      RETURN NEW;
    END IF;
    RETURN NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_block_early_match_notifications ON notification_jobs;
CREATE TRIGGER trg_block_early_match_notifications
  BEFORE INSERT ON notification_jobs
  FOR EACH ROW
  EXECUTE FUNCTION block_early_match_notifications();
