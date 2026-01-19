-- Migration: Securely fetch match RSVPs for matches in user's groups
-- Date: 2026-01-18

CREATE OR REPLACE FUNCTION get_match_rsvps_for_matches(
  p_match_ids UUID[]
)
RETURNS TABLE (
  match_id UUID,
  user_id UUID,
  status TEXT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT mr.match_id, mr.user_id, mr.status::text
  FROM match_rsvps mr
  JOIN matches m ON m.id = mr.match_id
  JOIN group_members gm ON gm.group_id = m.group_id
  WHERE mr.match_id = ANY(p_match_ids)
    AND gm.user_id = auth.uid();
$$;

GRANT EXECUTE ON FUNCTION get_match_rsvps_for_matches(UUID[]) TO authenticated;
