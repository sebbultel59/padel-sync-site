-- Update notification_jobs RPC for V1 match opportunity notifications
-- Adds kinds:
-- - match_proposed
-- - match_almost_full
-- Adds payload-based de-duplication via payload.dedupe_key

CREATE OR REPLACE FUNCTION create_notification_job(
  p_kind TEXT,
  p_match_id UUID,
  p_group_id UUID,
  p_recipients UUID[],
  p_payload JSONB DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_allowed BOOLEAN;
  v_payload JSONB;
  v_dedupe_key TEXT;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Utilisateur non authentifié';
  END IF;

  -- Only allow certain kinds from client-side
  IF p_kind NOT IN ('match_confirmed', 'group_match_created', 'match_proposed', 'match_almost_full') THEN
    RAISE EXCEPTION 'Type de notification non autorisé';
  END IF;

  -- Validate group membership
  SELECT EXISTS (
    SELECT 1 FROM group_members gm
    WHERE gm.group_id = p_group_id
      AND gm.user_id = v_user_id
  ) INTO v_allowed;

  IF NOT v_allowed THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;

  -- Validate match belongs to group (if match_id is provided)
  IF p_match_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM matches m WHERE m.id = p_match_id AND m.group_id = p_group_id
    ) THEN
      RAISE EXCEPTION 'Match invalide pour ce groupe';
    END IF;
  END IF;

  -- Ensure allow_after_countdown flag is set for trigger bypass
  v_payload := COALESCE(p_payload, '{}'::jsonb) || jsonb_build_object('allow_after_countdown', true);
  v_dedupe_key := v_payload->>'dedupe_key';

  IF p_recipients IS NULL OR array_length(p_recipients, 1) IS NULL THEN
    RETURN;
  END IF;

  -- Dedupe:
  -- - If payload.dedupe_key exists -> dedupe by (kind, match_id, dedupe_key)
  -- - Else -> fallback to old dedupe by (kind, match_id)
  IF v_dedupe_key IS NOT NULL AND length(v_dedupe_key) > 0 THEN
    IF EXISTS (
      SELECT 1 FROM notification_jobs
      WHERE kind = p_kind
        AND match_id IS NOT DISTINCT FROM p_match_id
        AND payload->>'dedupe_key' = v_dedupe_key
    ) THEN
      RETURN;
    END IF;
  ELSE
    IF EXISTS (
      SELECT 1 FROM notification_jobs
      WHERE kind = p_kind
        AND match_id IS NOT DISTINCT FROM p_match_id
        AND created_at >= NOW() - INTERVAL '5 minutes'
    ) THEN
      RETURN;
    END IF;
  END IF;

  INSERT INTO notification_jobs (
    kind,
    recipients,
    match_id,
    group_id,
    payload,
    created_at
  )
  VALUES (
    p_kind,
    p_recipients,
    p_match_id,
    p_group_id,
    v_payload,
    NOW()
  );
END;
$$;

-- Keep existing grants
GRANT EXECUTE ON FUNCTION create_notification_job(TEXT, UUID, UUID, UUID[], JSONB) TO authenticated;

