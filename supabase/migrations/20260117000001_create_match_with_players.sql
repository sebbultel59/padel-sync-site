-- Migration: Create match with all players accepted
-- Date: 2026-01-17

CREATE OR REPLACE FUNCTION create_match_with_players(
  p_group UUID,
  p_time_slot UUID,
  p_user_ids UUID[]
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_match_id UUID;
  v_slot_group_id UUID;
  v_user_id UUID;
  v_ids UUID[];
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Utilisateur non authentifié';
  END IF;

  -- Vérifier le time_slot
  SELECT group_id INTO v_slot_group_id
  FROM time_slots
  WHERE id = p_time_slot;

  IF v_slot_group_id IS NULL THEN
    NULL;
  ELSIF v_slot_group_id <> p_group THEN
    RAISE EXCEPTION 'Le time_slot ne correspond pas au groupe';
  END IF;

  -- Normaliser la liste des joueurs (inclure le créateur)
  v_ids := ARRAY(
    SELECT DISTINCT unnest(ARRAY_APPEND(COALESCE(p_user_ids, '{}'), v_user_id))
  );

  -- Vérifier si un match existe déjà
  SELECT id INTO v_match_id
  FROM matches
  WHERE group_id = p_group
    AND time_slot_id = p_time_slot
  LIMIT 1;

  IF v_match_id IS NULL THEN
    v_match_id := gen_random_uuid();
    INSERT INTO matches (id, group_id, time_slot_id, status, created_by, created_at)
    VALUES (v_match_id, p_group, p_time_slot, 'confirmed', v_user_id, NOW());
  ELSE
    UPDATE matches
    SET status = 'confirmed'
    WHERE id = v_match_id;
  END IF;

  -- RSVP accepté pour tous les joueurs
  INSERT INTO match_rsvps (match_id, user_id, status)
  SELECT v_match_id, uid, 'accepted'
  FROM unnest(v_ids) AS uid
  ON CONFLICT (match_id, user_id)
  DO UPDATE SET status = 'accepted';

  RETURN v_match_id;
END;
$$;

GRANT EXECUTE ON FUNCTION create_match_with_players(UUID, UUID, UUID[]) TO authenticated;
