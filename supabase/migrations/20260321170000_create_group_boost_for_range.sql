-- Boost Dispos : création / réutilisation de time_slot + événement boost_slot (sans time_slot préexistant côté client)
-- Remplace le flux « obligatoire » par une RPC unique (SECURITY DEFINER).

CREATE OR REPLACE FUNCTION create_group_boost_for_range(
  p_group_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
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
  v_slot_id uuid;
  v_existing_ends timestamptz;
  v_id uuid;
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
  IF p_title IS NOT NULL AND length(p_title) > 200 THEN
    RAISE EXCEPTION 'Titre trop long';
  END IF;
  IF p_starts_at IS NULL OR p_ends_at IS NULL OR p_ends_at <= p_starts_at THEN
    RAISE EXCEPTION 'Plage horaire invalide';
  END IF;

  -- 1) Réutiliser un time_slot existant si la plage (début + fin) correspond exactement
  SELECT ts.id INTO v_slot_id
  FROM time_slots ts
  WHERE ts.group_id = p_group_id
    AND ts.starts_at = p_starts_at
    AND ts.ends_at = p_ends_at
  LIMIT 1;

  IF v_slot_id IS NULL THEN
    BEGIN
      INSERT INTO time_slots (group_id, starts_at, ends_at)
      VALUES (p_group_id, p_starts_at, p_ends_at)
      RETURNING id INTO v_slot_id;
    EXCEPTION
      WHEN unique_violation THEN
        SELECT ts.id, ts.ends_at INTO v_slot_id, v_existing_ends
        FROM time_slots ts
        WHERE ts.group_id = p_group_id
          AND ts.starts_at = p_starts_at
        LIMIT 1;

        IF v_slot_id IS NULL THEN
          RAISE EXCEPTION 'Créneau indisponible';
        END IF;

        IF v_existing_ends IS DISTINCT FROM p_ends_at THEN
          RAISE EXCEPTION 'Conflit : un créneau existe déjà à cette heure avec une autre durée.';
        END IF;
    END;
  END IF;

  -- 2) Pas de doublon : un boost actif (non expiré) existe déjà pour ce time_slot
  IF EXISTS (
    SELECT 1
    FROM group_activity_events gae
    WHERE gae.group_id = p_group_id
      AND gae.type = 'boost_slot'
      AND gae.related_slot_id = v_slot_id
      AND (gae.expires_at IS NULL OR gae.expires_at > now())
  ) THEN
    RAISE EXCEPTION 'Un boost existe déjà sur ce créneau.';
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
    v_slot_id,
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
      FROM time_slots ts WHERE ts.id = v_slot_id
    ),
    '{}'::jsonb,
    now() + interval '48 hours'
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION create_group_boost_for_range(uuid, timestamptz, timestamptz, text, text, text) TO authenticated;

COMMENT ON FUNCTION create_group_boost_for_range IS 'Boost Dispos : upsert time_slot sur la plage puis insert boost_slot (anti-doublon par slot actif).';
