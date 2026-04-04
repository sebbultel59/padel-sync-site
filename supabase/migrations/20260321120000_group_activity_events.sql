-- Fil d'activité de groupe (pas de chat libre) — V1
-- Types: boost_slot, almost_ready, admin_announcement, player_signal, match_created

CREATE TABLE IF NOT EXISTS group_activity_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  type text NOT NULL,
  author_user_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  related_slot_id uuid REFERENCES time_slots(id) ON DELETE SET NULL,
  related_match_id uuid REFERENCES matches(id) ON DELETE SET NULL,
  related_profile_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  title text,
  body text NOT NULL,
  cta_label text,
  cta_type text,
  cta_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_pinned boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  CONSTRAINT group_activity_events_type_check CHECK (
    type IN (
      'boost_slot',
      'almost_ready',
      'admin_announcement',
      'player_signal',
      'match_created'
    )
  ),
  CONSTRAINT group_activity_events_cta_type_check CHECK (
    cta_type IS NULL OR cta_type IN (
      'open_slot',
      'open_match',
      'open_group_dispos',
      'open_player_availability',
      'none'
    )
  )
);

CREATE INDEX IF NOT EXISTS idx_gae_group_created_desc
  ON group_activity_events (group_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_gae_group_type
  ON group_activity_events (group_id, type);

CREATE INDEX IF NOT EXISTS idx_gae_expires
  ON group_activity_events (expires_at)
  WHERE expires_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_gae_related_slot
  ON group_activity_events (related_slot_id)
  WHERE related_slot_id IS NOT NULL;

ALTER TABLE group_activity_events ENABLE ROW LEVEL SECURITY;

-- Lecture: membres du groupe uniquement
DROP POLICY IF EXISTS "group_activity_select_members" ON group_activity_events;
CREATE POLICY "group_activity_select_members"
  ON group_activity_events
  FOR SELECT
  USING (is_member_of_group(group_id, auth.uid()));

-- Pas d'INSERT/UPDATE/DELETE direct pour les clients : RPC SECURITY DEFINER uniquement

-- ---------- RPC : boost créneau ----------
CREATE OR REPLACE FUNCTION create_group_activity_boost(
  p_group_id uuid,
  p_time_slot_id uuid,
  p_title text,
  p_body text,
  p_cta_label text DEFAULT 'Me rendre dispo'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_id uuid;
  v_slot_group uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Non authentifié';
  END IF;
  IF NOT is_member_of_group(p_group_id, v_uid) THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;
  IF p_body IS NULL OR length(trim(p_body)) = 0 THEN
    RAISE EXCEPTION 'Texte requis';
  END IF;
  IF length(p_body) > 500 THEN
    RAISE EXCEPTION 'Texte trop long';
  END IF;
  IF p_title IS NOT NULL AND length(p_title) > 200 THEN
    RAISE EXCEPTION 'Titre trop long';
  END IF;

  SELECT ts.group_id INTO v_slot_group
  FROM time_slots ts
  WHERE ts.id = p_time_slot_id;

  IF v_slot_group IS NULL OR v_slot_group <> p_group_id THEN
    RAISE EXCEPTION 'Créneau invalide pour ce groupe';
  END IF;

  IF EXISTS (
    SELECT 1 FROM group_activity_events gae
    WHERE gae.group_id = p_group_id
      AND gae.type = 'boost_slot'
      AND gae.related_slot_id = p_time_slot_id
      AND gae.author_user_id = v_uid
      AND gae.created_at > now() - interval '2 hours'
  ) THEN
    RAISE EXCEPTION 'Tu as déjà boosté ce créneau récemment';
  END IF;

  INSERT INTO group_activity_events (
    group_id, type, author_user_id, related_slot_id,
    title, body, cta_label, cta_type, cta_payload, metadata,
    expires_at
  )
  VALUES (
    p_group_id,
    'boost_slot',
    v_uid,
    p_time_slot_id,
    NULLIF(trim(p_title), ''),
    trim(p_body),
    NULLIF(trim(COALESCE(p_cta_label, 'Me rendre dispo')), ''),
    'open_slot',
    (
      SELECT jsonb_build_object(
        'group_id', p_group_id::text,
        'slot_id', ts.id,
        'slot_starts_at', ts.starts_at,
        'slot_ends_at', ts.ends_at
      )
      FROM time_slots ts WHERE ts.id = p_time_slot_id
    ),
    '{}'::jsonb,
    now() + interval '48 hours'
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION create_group_activity_boost(uuid, uuid, text, text, text) TO authenticated;

-- ---------- RPC : signal joueur ----------
CREATE OR REPLACE FUNCTION create_group_activity_player_signal(
  p_group_id uuid,
  p_window text,
  p_title text,
  p_body text,
  p_cta_label text DEFAULT 'Voir les dispos du groupe'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Non authentifié';
  END IF;
  IF NOT is_member_of_group(p_group_id, v_uid) THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;
  IF p_window IS NULL OR p_window NOT IN ('today', 'tonight', 'tomorrow', 'weekend') THEN
    RAISE EXCEPTION 'Fenêtre invalide';
  END IF;
  IF p_body IS NULL OR length(trim(p_body)) > 500 THEN
    RAISE EXCEPTION 'Texte invalide';
  END IF;
  IF p_title IS NOT NULL AND length(p_title) > 200 THEN
    RAISE EXCEPTION 'Titre trop long';
  END IF;

  IF EXISTS (
    SELECT 1 FROM group_activity_events gae
    WHERE gae.group_id = p_group_id
      AND gae.type = 'player_signal'
      AND gae.author_user_id = v_uid
      AND (gae.metadata->>'window') = p_window
      AND gae.created_at > now() - interval '4 hours'
  ) THEN
    RAISE EXCEPTION 'Tu as déjà signalé cette période récemment';
  END IF;

  INSERT INTO group_activity_events (
    group_id, type, author_user_id,
    related_profile_id,
    title, body, cta_label, cta_type, cta_payload, metadata,
    expires_at
  )
  VALUES (
    p_group_id,
    'player_signal',
    v_uid,
    v_uid,
    NULLIF(trim(p_title), ''),
    trim(p_body),
    NULLIF(trim(COALESCE(p_cta_label, 'Voir les dispos du groupe')), ''),
    'open_group_dispos',
    jsonb_build_object('group_id', p_group_id::text),
    jsonb_build_object('window', p_window),
    now() + interval '24 hours'
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION create_group_activity_player_signal(uuid, text, text, text, text) TO authenticated;

-- ---------- RPC : annonce admin ----------
CREATE OR REPLACE FUNCTION create_group_activity_admin_announcement(
  p_group_id uuid,
  p_body text,
  p_cta_type text DEFAULT 'none',
  p_cta_label text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_id uuid;
  v_cta text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Non authentifié';
  END IF;
  IF NOT can_manage_group(p_group_id, v_uid) THEN
    RAISE EXCEPTION 'Réservé aux gestionnaires du groupe';
  END IF;
  IF p_body IS NULL OR length(trim(p_body)) = 0 THEN
    RAISE EXCEPTION 'Texte requis';
  END IF;
  IF length(trim(p_body)) > 400 THEN
    RAISE EXCEPTION 'Annonce trop longue';
  END IF;

  v_cta := COALESCE(NULLIF(trim(p_cta_type), ''), 'none');
  IF v_cta NOT IN ('none', 'open_group_dispos') THEN
    RAISE EXCEPTION 'CTA invalide';
  END IF;

  INSERT INTO group_activity_events (
    group_id, type, author_user_id,
    title, body, cta_label, cta_type, cta_payload, metadata,
    expires_at
  )
  VALUES (
    p_group_id,
    'admin_announcement',
    v_uid,
    NULL,
    trim(p_body),
    CASE WHEN v_cta = 'none' THEN NULL ELSE COALESCE(NULLIF(trim(p_cta_label), ''), 'Voir les dispos') END,
    v_cta,
    CASE WHEN v_cta = 'open_group_dispos' THEN jsonb_build_object('group_id', p_group_id::text) ELSE '{}'::jsonb END,
    '{}'::jsonb,
    NULL
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION create_group_activity_admin_announcement(uuid, text, text, text) TO authenticated;

-- ---------- RPC : match créé (appel client après création) ----------
CREATE OR REPLACE FUNCTION create_group_activity_match_created(
  p_group_id uuid,
  p_match_id uuid,
  p_body text,
  p_cta_label text DEFAULT 'Voir le match'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_id uuid;
  v_g uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Non authentifié';
  END IF;
  IF NOT is_member_of_group(p_group_id, v_uid) THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;
  IF p_body IS NULL OR length(trim(p_body)) = 0 THEN
    RAISE EXCEPTION 'Texte requis';
  END IF;
  IF length(trim(p_body)) > 500 THEN
    RAISE EXCEPTION 'Texte trop long';
  END IF;

  SELECT m.group_id INTO v_g FROM matches m WHERE m.id = p_match_id;
  IF v_g IS NULL OR v_g <> p_group_id THEN
    RAISE EXCEPTION 'Match invalide pour ce groupe';
  END IF;

  IF EXISTS (
    SELECT 1 FROM group_activity_events gae
    WHERE gae.group_id = p_group_id
      AND gae.type = 'match_created'
      AND gae.related_match_id = p_match_id
      AND gae.created_at > now() - interval '2 minutes'
  ) THEN
    RETURN (
      SELECT gae.id FROM group_activity_events gae
      WHERE gae.group_id = p_group_id
        AND gae.type = 'match_created'
        AND gae.related_match_id = p_match_id
      ORDER BY gae.created_at DESC
      LIMIT 1
    );
  END IF;

  INSERT INTO group_activity_events (
    group_id, type, author_user_id,
    related_match_id,
    title, body, cta_label, cta_type, cta_payload, metadata,
    expires_at
  )
  VALUES (
    p_group_id,
    'match_created',
    v_uid,
    p_match_id,
    NULL,
    trim(p_body),
    NULLIF(trim(COALESCE(p_cta_label, 'Voir le match')), ''),
    'open_match',
    jsonb_build_object('match_id', p_match_id::text, 'group_id', p_group_id::text),
    '{}'::jsonb,
    now() + interval '7 days'
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION create_group_activity_match_created(uuid, uuid, text, text) TO authenticated;

-- ---------- RPC : almost_ready (no-op V1 — détection en V2) ----------
CREATE OR REPLACE FUNCTION create_group_activity_almost_ready(
  p_group_id uuid,
  p_time_slot_id uuid,
  p_body text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION create_group_activity_almost_ready(uuid, uuid, text) TO authenticated;

COMMENT ON TABLE group_activity_events IS 'Fil d’activité de groupe (structuré, sans chat libre)';
COMMENT ON FUNCTION create_group_activity_boost IS 'Crée un événement boost_slot (anti-spam 2h par créneau)';
COMMENT ON FUNCTION create_group_activity_player_signal IS 'Crée un player_signal (anti-spam 4h par fenêtre)';
COMMENT ON FUNCTION create_group_activity_admin_announcement IS 'Annonce admin (can_manage_group)';
COMMENT ON FUNCTION create_group_activity_match_created IS 'Événement match créé (appelé depuis l’app après création)';
COMMENT ON FUNCTION create_group_activity_almost_ready IS 'No-op en V1 — réservé détection auto (V2)';
