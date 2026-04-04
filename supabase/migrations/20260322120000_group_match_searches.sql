-- Recherches de partie « Trouver » (pas un match validé) + extension activité groupe

CREATE TABLE IF NOT EXISTS group_match_searches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  creator_user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  starts_at timestamptz NOT NULL,
  club_id uuid NOT NULL REFERENCES clubs(id) ON DELETE RESTRICT,
  places_to_fill int NOT NULL CHECK (places_to_fill >= 1 AND places_to_fill <= 3),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'filled', 'cancelled', 'converted')),
  converted_match_id uuid REFERENCES matches(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  CONSTRAINT group_match_searches_places_consistency CHECK (places_to_fill <= 3)
);

CREATE INDEX IF NOT EXISTS idx_gms_group_status ON group_match_searches (group_id, status);
CREATE INDEX IF NOT EXISTS idx_gms_starts ON group_match_searches (starts_at);

CREATE TABLE IF NOT EXISTS group_match_search_players (
  search_id uuid NOT NULL REFERENCES group_match_searches(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  PRIMARY KEY (search_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_gmsp_user ON group_match_search_players (user_id);

ALTER TABLE group_activity_events
  ADD COLUMN IF NOT EXISTS related_search_id uuid REFERENCES group_match_searches(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_gae_related_search ON group_activity_events (related_search_id) WHERE related_search_id IS NOT NULL;

ALTER TABLE group_activity_events DROP CONSTRAINT IF EXISTS group_activity_events_type_check;
ALTER TABLE group_activity_events ADD CONSTRAINT group_activity_events_type_check CHECK (
  type IN (
    'boost_slot',
    'almost_ready',
    'admin_announcement',
    'player_signal',
    'match_created',
    'find_game'
  )
);

ALTER TABLE group_activity_events DROP CONSTRAINT IF EXISTS group_activity_events_cta_type_check;
ALTER TABLE group_activity_events ADD CONSTRAINT group_activity_events_cta_type_check CHECK (
  cta_type IS NULL OR cta_type IN (
    'open_slot',
    'open_match',
    'open_group_dispos',
    'open_player_availability',
    'open_find_game',
    'none'
  )
);

ALTER TABLE group_match_searches ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_match_search_players ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "gms_select_members" ON group_match_searches;
CREATE POLICY "gms_select_members"
  ON group_match_searches FOR SELECT
  USING (is_member_of_group(group_id, auth.uid()));

DROP POLICY IF EXISTS "gmsp_select_members" ON group_match_search_players;
CREATE POLICY "gmsp_select_members"
  ON group_match_search_players FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM group_match_searches g
      WHERE g.id = search_id AND is_member_of_group(g.group_id, auth.uid())
    )
  );

-- Pas d’INSERT/UPDATE direct : RPC uniquement

CREATE OR REPLACE FUNCTION create_group_match_search(
  p_group_id uuid,
  p_starts_at timestamptz,
  p_club_id uuid,
  p_places_to_fill int,
  p_player_ids uuid[]
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_search_id uuid;
  v_body text;
  v_club_name text;
  v_n int;
  v_player uuid;
  v_ids uuid[];
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Non authentifié';
  END IF;
  IF NOT is_member_of_group(p_group_id, v_uid) THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;
  IF p_places_to_fill IS NULL OR p_places_to_fill < 1 OR p_places_to_fill > 3 THEN
    RAISE EXCEPTION 'Nombre de places invalide';
  END IF;
  IF p_starts_at IS NULL OR p_starts_at < now() - interval '1 minute' THEN
    RAISE EXCEPTION 'Date/heure invalide';
  END IF;

  v_ids := coalesce(
    ARRAY(SELECT DISTINCT unnest(coalesce(p_player_ids, array[]::uuid[]))),
    array[]::uuid[]
  );
  IF NOT v_uid = ANY(v_ids) THEN
    v_ids := array_append(v_ids, v_uid);
  END IF;

  v_n := COALESCE(array_length(v_ids, 1), 0);
  IF v_n + p_places_to_fill <> 4 THEN
    RAISE EXCEPTION 'Le nombre de joueurs sélectionnés plus les places à compléter doit égaler 4';
  END IF;

  SELECT name INTO v_club_name FROM clubs WHERE id = p_club_id;
  IF v_club_name IS NULL THEN
    RAISE EXCEPTION 'Club invalide';
  END IF;

  INSERT INTO group_match_searches (
    group_id, creator_user_id, starts_at, club_id, places_to_fill,
    status, expires_at
  )
  VALUES (
    p_group_id, v_uid, p_starts_at, p_club_id, p_places_to_fill,
    'open',
    now() + interval '7 days'
  )
  RETURNING id INTO v_search_id;

  FOREACH v_player IN ARRAY v_ids LOOP
    INSERT INTO group_match_search_players (search_id, user_id)
    VALUES (v_search_id, v_player)
    ON CONFLICT DO NOTHING;
  END LOOP;

  v_body := format(
    '🎯 Recherche de partie · %s · %s · %s place(s) à compléter',
    to_char(p_starts_at AT TIME ZONE 'Europe/Paris', 'DD/MM/YYYY HH24:MI'),
    v_club_name,
    p_places_to_fill
  );

  INSERT INTO group_activity_events (
    group_id, type, author_user_id, related_search_id,
    title, body, cta_label, cta_type, cta_payload, metadata,
    expires_at
  )
  VALUES (
    p_group_id,
    'find_game',
    v_uid,
    v_search_id,
    NULL,
    v_body,
    'Rejoindre',
    'open_find_game',
    jsonb_build_object(
      'search_id', v_search_id::text,
      'group_id', p_group_id::text,
      'club_id', p_club_id::text
    ),
    jsonb_build_object('places_to_fill', p_places_to_fill),
    now() + interval '7 days'
  );

  RETURN v_search_id;
END;
$$;

GRANT EXECUTE ON FUNCTION create_group_match_search(uuid, timestamptz, uuid, int, uuid[]) TO authenticated;

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
    UPDATE group_match_searches SET status = 'filled' WHERE id = p_search_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION join_group_match_search(uuid) TO authenticated;

COMMENT ON TABLE group_match_searches IS 'Recherche de partie structurée (Trouver), distincte des matchs validés';
COMMENT ON FUNCTION create_group_match_search IS 'Crée une recherche Trouver + événement find_game';
COMMENT ON FUNCTION join_group_match_search IS 'Rejoint une recherche Trouver (4 joueurs => filled)';
