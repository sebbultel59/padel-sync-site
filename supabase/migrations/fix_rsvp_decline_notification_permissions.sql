-- Migration: Fix permissions for RSVP decline notifications
-- Date: 2025-01-XX
-- Problem: When a user declines a match RSVP, a trigger tries to insert into notification_outbox
-- but fails due to RLS policies that block user access.
-- Solution: Create a function with SECURITY DEFINER to handle RSVP updates and create notifications

-- Function to update RSVP status with proper permissions for notifications
DROP FUNCTION IF EXISTS update_match_rsvp_status(UUID, UUID, TEXT);
CREATE OR REPLACE FUNCTION update_match_rsvp_status(
  p_match_id UUID,
  p_user_id UUID,
  p_status TEXT,
  p_skip_notification BOOLEAN DEFAULT FALSE
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_match_group_id UUID;
  v_actor_name TEXT;
  v_match_starts_at TIMESTAMPTZ;
  v_match_ends_at TIMESTAMPTZ;
  v_notification_kind TEXT;
  v_recipient_ids UUID[];
  v_normalized_status TEXT;
BEGIN
  -- Normalize the status to match the enum
  v_normalized_status := CASE 
    WHEN p_status IN ('no', 'non', 'declined', 'refusé') THEN 'no'
    WHEN p_status IN ('accepted', 'yes', 'oui', 'accepté') THEN 'accepted'
    WHEN p_status IN ('maybe', 'peut-être', 'peut etre') THEN 'maybe'
    ELSE p_status
  END;
  
  -- Get match information
  SELECT m.group_id, ts.starts_at, ts.ends_at
  INTO v_match_group_id, v_match_starts_at, v_match_ends_at
  FROM matches m
  LEFT JOIN time_slots ts ON ts.id = m.time_slot_id
  WHERE m.id = p_match_id;
  
  -- Get actor name
  SELECT display_name INTO v_actor_name
  FROM profiles
  WHERE id = p_user_id;
  
  -- Determine notification kind based on normalized status (unless skipped)
  IF p_skip_notification THEN
    v_notification_kind := NULL;
  ELSE
    IF v_normalized_status = 'no' THEN
      v_notification_kind := 'rsvp_declined';
    ELSIF v_normalized_status = 'accepted' THEN
      v_notification_kind := 'rsvp_accepted';
    ELSIF v_normalized_status = 'maybe' THEN
      v_notification_kind := 'rsvp_maybe';
    ELSE
      v_notification_kind := NULL; -- No notification for other statuses
    END IF;
  END IF;
  
  -- Update the RSVP status (cast to rsvp_status enum)
  INSERT INTO match_rsvps (match_id, user_id, status)
  VALUES (p_match_id, p_user_id, v_normalized_status::rsvp_status)
  ON CONFLICT (match_id, user_id)
  DO UPDATE SET status = EXCLUDED.status::rsvp_status;
  
  -- Create notification if needed
  IF v_notification_kind IS NOT NULL AND v_match_group_id IS NOT NULL THEN
    -- Get all other players in the match (excluding the actor)
    SELECT ARRAY_AGG(DISTINCT mr.user_id)
    INTO v_recipient_ids
    FROM match_rsvps mr
    WHERE mr.match_id = p_match_id
      AND mr.user_id != p_user_id
      AND mr.status::text IN ('accepted', 'maybe');
    
    -- Only create notification if there are recipients
    IF v_recipient_ids IS NOT NULL AND array_length(v_recipient_ids, 1) > 0 THEN
      INSERT INTO notification_jobs (
        kind,
        recipients,
        group_id,
        match_id,
        actor_id,
        payload,
        created_at
      )
      VALUES (
        v_notification_kind,
        v_recipient_ids,
        v_match_group_id,
        p_match_id,
        p_user_id,
        jsonb_build_object(
          'actor_name', COALESCE(v_actor_name, 'Un joueur'),
          'starts_at', v_match_starts_at,
          'ends_at', v_match_ends_at
        ),
        NOW()
      );
    END IF;
  END IF;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION update_match_rsvp_status(UUID, UUID, TEXT, BOOLEAN) TO authenticated;

-- Comment
COMMENT ON FUNCTION update_match_rsvp_status IS 
  'Updates match RSVP status with proper permissions and creates notifications. Use this instead of direct UPDATE to avoid RLS issues and ensure notifications are created.';

