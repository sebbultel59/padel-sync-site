-- Migration: join_group_by_id returns JSON {group_id, status} instead of UUID
-- Statuses: joined, already_member, invite_required, group_not_found, unauthenticated

DROP FUNCTION IF EXISTS join_group_by_id(uuid);

CREATE OR REPLACE FUNCTION join_group_by_id(p_group_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID;
  v_join_policy TEXT;
  v_visibility TEXT;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('group_id', p_group_id, 'status', 'unauthenticated');
  END IF;

  SELECT visibility, join_policy INTO v_visibility, v_join_policy
  FROM groups
  WHERE id = p_group_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('group_id', p_group_id, 'status', 'group_not_found');
  END IF;

  IF EXISTS (SELECT 1 FROM group_members WHERE group_id = p_group_id AND user_id = v_user_id) THEN
    RETURN jsonb_build_object('group_id', p_group_id, 'status', 'already_member');
  END IF;

  IF v_visibility = 'public' AND v_join_policy = 'open' THEN
    INSERT INTO group_members (group_id, user_id, role)
    VALUES (p_group_id, v_user_id, 'member')
    ON CONFLICT (group_id, user_id) DO NOTHING;
    RETURN jsonb_build_object('group_id', p_group_id, 'status', 'joined');
  END IF;

  IF v_visibility = 'private' AND v_join_policy = 'invite' THEN
    INSERT INTO group_members (group_id, user_id, role)
    VALUES (p_group_id, v_user_id, 'member')
    ON CONFLICT (group_id, user_id) DO NOTHING;
    RETURN jsonb_build_object('group_id', p_group_id, 'status', 'joined');
  END IF;

  RETURN jsonb_build_object('group_id', p_group_id, 'status', 'invite_required');
END;
$$;

COMMENT ON FUNCTION join_group_by_id IS 'Rejoint un groupe par ID. Retourne {group_id, status}: joined, already_member, invite_required, group_not_found, unauthenticated.';
