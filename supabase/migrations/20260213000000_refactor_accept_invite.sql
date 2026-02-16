-- Migration: Refactor accept_invite - invitation validation, reusable codes, rejoin idempotent
-- Date: 2026-02-13
-- Returns JSONB {group_id, status} instead of UUID. Statuses: joined, already_approved, pending, reopened_pending, code_used, code_expired, code_max_uses, code_invalid

DROP FUNCTION IF EXISTS accept_invite(text);

CREATE OR REPLACE FUNCTION accept_invite(p_code TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID;
  v_invitation RECORD;
  v_group_id UUID;
  v_visibility TEXT;
  v_join_policy TEXT;
  v_status TEXT;
  v_existing RECORD;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Utilisateur non authentifié';
  END IF;

  SELECT id, group_id, used, expires_at, reusable, max_uses, uses
  INTO v_invitation
  FROM invitations
  WHERE code = UPPER(TRIM(p_code))
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('group_id', NULL, 'status', 'code_invalid');
  END IF;

  v_group_id := v_invitation.group_id;

  -- 1) Invitation validation
  IF v_invitation.expires_at IS NOT NULL AND v_invitation.expires_at < NOW() THEN
    RETURN jsonb_build_object('group_id', v_group_id, 'status', 'code_expired');
  END IF;

  IF COALESCE(v_invitation.reusable, false) = false THEN
    IF v_invitation.used THEN
      RETURN jsonb_build_object('group_id', v_group_id, 'status', 'code_used');
    END IF;
  ELSE
    -- reusable=true: ignore 'used', check max_uses
    IF v_invitation.max_uses IS NOT NULL AND COALESCE(v_invitation.uses, 0) >= v_invitation.max_uses THEN
      RETURN jsonb_build_object('group_id', v_group_id, 'status', 'code_max_uses');
    END IF;
  END IF;

  -- Fetch group visibility/join_policy
  SELECT visibility, join_policy INTO v_visibility, v_join_policy
  FROM groups WHERE id = v_group_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('group_id', v_group_id, 'status', 'code_invalid');
  END IF;

  -- Already member -> success
  IF EXISTS (SELECT 1 FROM group_members WHERE group_id = v_group_id AND user_id = v_user_id) THEN
    RETURN jsonb_build_object('group_id', v_group_id, 'status', 'joined');
  END IF;

  -- Direct join: public+open, public+invite, private+invite
  IF (v_visibility = 'public' AND v_join_policy IN ('open', 'invite'))
     OR (v_visibility = 'private' AND v_join_policy = 'invite') THEN
    INSERT INTO group_members (group_id, user_id, role)
    VALUES (v_group_id, v_user_id, 'member')
    ON CONFLICT (group_id, user_id) DO NOTHING;

    -- Update invitation usage
    IF COALESCE(v_invitation.reusable, false) = false THEN
      UPDATE invitations SET used = true, used_by = v_user_id, used_at = NOW() WHERE id = v_invitation.id;
    ELSE
      UPDATE invitations SET uses = COALESCE(uses, 0) + 1 WHERE id = v_invitation.id;
    END IF;

    RETURN jsonb_build_object('group_id', v_group_id, 'status', 'joined');
  END IF;

  -- Request groups: use group_join_requests (upsert, rejoin idempotent)
  IF v_visibility = 'public' AND v_join_policy = 'request' THEN
    SELECT status, reviewed_at, reviewed_by INTO v_existing
    FROM group_join_requests
    WHERE group_id = v_group_id AND user_id = v_user_id
    LIMIT 1;

    IF FOUND THEN
      IF v_existing.status = 'approved' THEN
        -- Already approved: add to group_members if not already
        INSERT INTO group_members (group_id, user_id, role)
        VALUES (v_group_id, v_user_id, 'member')
        ON CONFLICT (group_id, user_id) DO NOTHING;

        IF COALESCE(v_invitation.reusable, false) = false THEN
          UPDATE invitations SET used = true, used_by = v_user_id, used_at = NOW() WHERE id = v_invitation.id;
        ELSE
          UPDATE invitations SET uses = COALESCE(uses, 0) + 1 WHERE id = v_invitation.id;
        END IF;

        RETURN jsonb_build_object('group_id', v_group_id, 'status', 'already_approved');
      ELSIF v_existing.status = 'pending' THEN
        RETURN jsonb_build_object('group_id', v_group_id, 'status', 'pending');
      ELSIF v_existing.status = 'rejected' THEN
        UPDATE group_join_requests
        SET status = 'pending', reviewed_at = NULL, reviewed_by = NULL
        WHERE group_id = v_group_id AND user_id = v_user_id;

        IF COALESCE(v_invitation.reusable, false) = false THEN
          UPDATE invitations SET used = true, used_by = v_user_id, used_at = NOW() WHERE id = v_invitation.id;
        ELSE
          UPDATE invitations SET uses = COALESCE(uses, 0) + 1 WHERE id = v_invitation.id;
        END IF;

        RETURN jsonb_build_object('group_id', v_group_id, 'status', 'reopened_pending');
      END IF;
    END IF;

    -- No existing request: insert new
    INSERT INTO group_join_requests (group_id, user_id, status)
    VALUES (v_group_id, v_user_id, 'pending')
    ON CONFLICT (group_id, user_id) DO UPDATE SET
      status = 'pending',
      reviewed_at = NULL,
      reviewed_by = NULL,
      requested_at = NOW();

    IF COALESCE(v_invitation.reusable, false) = false THEN
      UPDATE invitations SET used = true, used_by = v_user_id, used_at = NOW() WHERE id = v_invitation.id;
    ELSE
      UPDATE invitations SET uses = COALESCE(uses, 0) + 1 WHERE id = v_invitation.id;
    END IF;

    RETURN jsonb_build_object('group_id', v_group_id, 'status', 'pending');
  END IF;

  -- Unsupported group type
  RETURN jsonb_build_object('group_id', v_group_id, 'status', 'code_invalid');
END;
$$;

COMMENT ON FUNCTION accept_invite IS 
  'Accepte une invitation par code. Retourne {group_id, status}. Statuts: joined, already_approved, pending, reopened_pending, code_used, code_expired, code_max_uses, code_invalid. Gère les codes réutilisables et le rejoin idempotent via group_join_requests.';
