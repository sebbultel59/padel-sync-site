-- Cancel active boost(s) covering a given slot start.

CREATE OR REPLACE FUNCTION cancel_group_boost_for_start(
  p_group_id uuid,
  p_start_at timestamptz
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_count integer := 0;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Non authentifie';
  END IF;
  IF NOT is_member_of_group(p_group_id, v_uid) THEN
    RAISE EXCEPTION 'Acces refuse';
  END IF;
  IF p_start_at IS NULL THEN
    RAISE EXCEPTION 'Heure invalide';
  END IF;

  UPDATE group_activity_events gae
  SET expires_at = now()
  FROM time_slots ts
  WHERE gae.group_id = p_group_id
    AND gae.type = 'boost_slot'
    AND gae.related_slot_id = ts.id
    AND ts.group_id = p_group_id
    AND (gae.expires_at IS NULL OR gae.expires_at > now())
    AND p_start_at >= ts.starts_at
    AND p_start_at < ts.ends_at;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION cancel_group_boost_for_start(uuid, timestamptz) TO authenticated;

COMMENT ON FUNCTION cancel_group_boost_for_start IS
'Annule les boosts actifs couvrant un start donne (set expires_at = now()).';
