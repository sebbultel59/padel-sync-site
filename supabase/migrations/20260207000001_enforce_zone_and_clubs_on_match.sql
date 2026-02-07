-- Migration: Enforce zone + common clubs on match creation
-- Date: 2026-02-07

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
  v_zone_id UUID;
  v_zone_count INTEGER;
  v_player_count INTEGER;
  v_common_club UUID;
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
  v_player_count := COALESCE(array_length(v_ids, 1), 0);

  IF v_player_count < 4 THEN
    RAISE EXCEPTION 'Il faut 4 joueurs pour créer un match';
  END IF;

  -- Vérifier zone_id commun
  SELECT COUNT(DISTINCT zone_id), MIN(zone_id)
  INTO v_zone_count, v_zone_id
  FROM profiles
  WHERE id = ANY(v_ids);

  IF v_zone_id IS NULL OR v_zone_count <> 1 THEN
    RAISE EXCEPTION 'Tous les joueurs doivent avoir la même zone';
  END IF;

  -- Calculer le club commun accepté (priorité aux préférés)
  WITH accepted AS (
    SELECT uc.user_id, uc.club_id, uc.is_preferred
    FROM user_clubs uc
    JOIN clubs c ON c.id = uc.club_id
    WHERE uc.is_accepted = true
      AND uc.user_id = ANY(v_ids)
      AND c.zone_id = v_zone_id
  ),
  counts AS (
    SELECT club_id,
           COUNT(DISTINCT user_id) AS cnt,
           SUM(CASE WHEN is_preferred THEN 1 ELSE 0 END) AS pref_cnt
    FROM accepted
    GROUP BY club_id
  )
  SELECT club_id
  INTO v_common_club
  FROM counts
  WHERE cnt = v_player_count
  ORDER BY pref_cnt DESC, club_id
  LIMIT 1;

  IF v_common_club IS NULL THEN
    RAISE EXCEPTION 'Aucun club commun sélectionné';
  END IF;

  -- Vérifier si un match existe déjà
  SELECT id INTO v_match_id
  FROM matches
  WHERE group_id = p_group
    AND time_slot_id = p_time_slot
  LIMIT 1;

  IF v_match_id IS NULL THEN
    v_match_id := gen_random_uuid();
    INSERT INTO matches (id, group_id, time_slot_id, status, created_by, created_at, club_id, zone_id)
    VALUES (v_match_id, p_group, p_time_slot, 'confirmed', v_user_id, NOW(), v_common_club, v_zone_id);
  ELSE
    UPDATE matches
    SET status = 'confirmed',
        club_id = v_common_club,
        zone_id = v_zone_id
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

DROP FUNCTION IF EXISTS create_match_from_slot(UUID, UUID);

CREATE FUNCTION create_match_from_slot(
  p_group UUID,
  p_time_slot UUID
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Utilisateur non authentifié';
  END IF;

  RAISE EXCEPTION 'create_match_from_slot obsolète: utilisez create_match_with_players';
END;
$$;
