-- Quand le 4e joueur rejoint une recherche « Trouver », créer automatiquement un match
-- confirmé + RSVPs acceptés, et marquer la recherche comme « converted ».
-- Évite la modale de création côté client et l’état « filled » sans match.

CREATE OR REPLACE FUNCTION convert_find_game_search_to_match(p_search_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_group_id uuid;
  v_club_id uuid;
  v_starts_at timestamptz;
  v_ends_at timestamptz;
  v_ids uuid[];
  v_match_id uuid;
  v_time_slot_id uuid;
  v_zone_id uuid;
  v_zone_count int;
  v_common_club uuid;
  v_group_club uuid;
  v_status text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Non authentifié';
  END IF;

  SELECT gms.group_id, gms.club_id, gms.starts_at, gms.status
  INTO v_group_id, v_club_id, v_starts_at, v_status
  FROM group_match_searches gms
  WHERE gms.id = p_search_id
  FOR UPDATE;

  IF v_group_id IS NULL THEN
    RAISE EXCEPTION 'Recherche introuvable';
  END IF;

  IF v_status NOT IN ('open', 'filled') THEN
    RAISE EXCEPTION 'Recherche déjà traitée';
  END IF;

  IF NOT is_member_of_group(v_group_id, v_uid) THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;

  SELECT ARRAY(
    SELECT user_id FROM group_match_search_players WHERE search_id = p_search_id ORDER BY user_id
  )
  INTO v_ids;

  IF COALESCE(array_length(v_ids, 1), 0) <> 4 THEN
    RAISE EXCEPTION 'Il faut exactement 4 joueurs';
  END IF;

  IF NOT (v_uid = ANY(v_ids)) THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;

  v_ends_at := v_starts_at + interval '90 minutes';

  SELECT COUNT(DISTINCT zone_id)::int, MIN(zone_id::text)::uuid
  INTO v_zone_count, v_zone_id
  FROM profiles
  WHERE id = ANY(v_ids);

  IF v_zone_id IS NULL OR v_zone_count <> 1 THEN
    RAISE EXCEPTION 'Tous les joueurs doivent avoir la même zone';
  END IF;

  SELECT club_id INTO v_group_club FROM groups WHERE id = v_group_id;

  IF v_club_id IS NOT NULL THEN
    SELECT c.id INTO v_common_club FROM clubs c WHERE c.id = v_club_id;
    IF v_common_club IS NULL THEN
      RAISE EXCEPTION 'Club inconnu';
    END IF;
  ELSIF v_group_club IS NOT NULL THEN
    v_common_club := v_group_club;
  ELSE
    RAISE EXCEPTION 'Club requis pour ce match';
  END IF;

  BEGIN
    INSERT INTO time_slots (group_id, starts_at, ends_at)
    VALUES (v_group_id, v_starts_at, v_ends_at)
    RETURNING id INTO v_time_slot_id;
  EXCEPTION
    WHEN unique_violation THEN
      SELECT ts.id INTO v_time_slot_id
      FROM time_slots ts
      WHERE ts.group_id = v_group_id
        AND ts.starts_at = v_starts_at
      LIMIT 1;
      IF v_time_slot_id IS NULL THEN
        RAISE;
      END IF;
  END;

  v_match_id := gen_random_uuid();
  INSERT INTO matches (id, group_id, time_slot_id, status, created_by, created_at, club_id, zone_id)
  VALUES (v_match_id, v_group_id, v_time_slot_id, 'confirmed', v_uid, NOW(), v_common_club, v_zone_id);

  INSERT INTO match_rsvps (match_id, user_id, status)
  SELECT v_match_id, s.player_id, 'accepted'::rsvp_status
  FROM (SELECT unnest(v_ids) AS player_id) s
  ON CONFLICT (match_id, user_id)
  DO UPDATE SET status = 'accepted'::rsvp_status;

  UPDATE group_match_searches
  SET status = 'converted',
      converted_match_id = v_match_id
  WHERE id = p_search_id
    AND status IN ('open', 'filled');

  RETURN v_match_id;
END;
$$;

COMMENT ON FUNCTION convert_find_game_search_to_match(uuid) IS
  'Crée un match confirmé + RSVPs depuis une recherche Trouver à 4 joueurs (appelée depuis join_group_match_search).';

CREATE OR REPLACE FUNCTION join_group_match_search(p_search_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_group uuid;
  v_cnt int;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Non authentifié';
  END IF;

  SELECT group_id INTO v_group
  FROM group_match_searches
  WHERE id = p_search_id AND status = 'open';

  IF v_group IS NULL THEN
    RAISE EXCEPTION 'Recherche introuvable ou fermée';
  END IF;

  IF NOT is_member_of_group(v_group, v_uid) THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;

  SELECT COUNT(*)::int INTO v_cnt FROM group_match_search_players WHERE search_id = p_search_id;
  IF v_cnt >= 4 THEN
    RAISE EXCEPTION 'La partie est déjà complète';
  END IF;

  IF EXISTS (SELECT 1 FROM group_match_search_players WHERE search_id = p_search_id AND user_id = v_uid) THEN
    RETURN;
  END IF;

  INSERT INTO group_match_search_players (search_id, user_id)
  VALUES (p_search_id, v_uid);

  SELECT COUNT(*)::int INTO v_cnt FROM group_match_search_players WHERE search_id = p_search_id;
  IF v_cnt >= 4 THEN
    PERFORM convert_find_game_search_to_match(p_search_id);
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION join_group_match_search(uuid) TO authenticated;

COMMENT ON FUNCTION join_group_match_search(uuid) IS
  'Rejoint une recherche Trouver ; à 4 joueurs, crée automatiquement le match validé.';
