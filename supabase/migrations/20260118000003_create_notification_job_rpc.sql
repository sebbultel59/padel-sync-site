-- Migration: RPC to create notification_jobs with SECURITY DEFINER
-- Date: 2026-01-18

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
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Utilisateur non authentifié';
  END IF;

  -- Only allow certain kinds from client-side
  IF p_kind NOT IN ('match_confirmed', 'group_match_created') THEN
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

  -- Validate match belongs to group
  IF p_match_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM matches m WHERE m.id = p_match_id AND m.group_id = p_group_id
    ) THEN
      RAISE EXCEPTION 'Match invalide pour ce groupe';
    END IF;
  END IF;

  -- Ensure allow_after_countdown flag is set for trigger bypass
  v_payload := COALESCE(p_payload, '{}'::jsonb) || jsonb_build_object('allow_after_countdown', true);

  IF p_recipients IS NULL OR array_length(p_recipients, 1) IS NULL THEN
    RETURN;
  END IF;

  -- Avoid duplicates for the same match + kind within a short window
  IF EXISTS (
    SELECT 1 FROM notification_jobs
    WHERE kind = p_kind
      AND match_id = p_match_id
      AND created_at >= NOW() - INTERVAL '5 minutes'
  ) THEN
    RETURN;
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

GRANT EXECUTE ON FUNCTION create_notification_job(TEXT, UUID, UUID, UUID[], JSONB) TO authenticated;
