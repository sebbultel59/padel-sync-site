-- Migration: Limites d'utilisation des codes d'invitation + deep link
-- Date: 2026-02-05

-- 1) Colonnes de suivi d'usage
ALTER TABLE invitations
ADD COLUMN IF NOT EXISTS max_uses INTEGER;

ALTER TABLE invitations
ADD COLUMN IF NOT EXISTS uses INTEGER DEFAULT 0;

COMMENT ON COLUMN invitations.max_uses IS 'Nombre maximum d''utilisations (NULL = illimité)';
COMMENT ON COLUMN invitations.uses IS 'Nombre d''utilisations effectuées';

-- 2) Fonction accept_invite avec compteur d'usage
CREATE OR REPLACE FUNCTION accept_invite(p_code TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID;
  v_invitation RECORD;
  v_group_id UUID;
  v_current_uses INTEGER;
BEGIN
  -- Récupérer l'ID de l'utilisateur actuel
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Utilisateur non authentifié';
  END IF;

  -- Chercher l'invitation par code
  SELECT id, group_id, used, expires_at, reusable, max_uses, uses
  INTO v_invitation
  FROM invitations
  WHERE code = UPPER(TRIM(p_code))
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Code d''invitation invalide';
  END IF;

  -- Pour les codes non réutilisables, vérifier s'ils ont été utilisés
  IF COALESCE(v_invitation.reusable, false) = false AND v_invitation.used THEN
    RAISE EXCEPTION 'Ce code d''invitation a déjà été utilisé';
  END IF;

  -- Vérifier si le code a expiré
  IF v_invitation.expires_at IS NOT NULL AND v_invitation.expires_at < NOW() THEN
    RAISE EXCEPTION 'Ce code d''invitation a expiré';
  END IF;

  -- Vérifier le quota d'utilisation
  v_current_uses := COALESCE(v_invitation.uses, 0);
  IF v_invitation.max_uses IS NOT NULL AND v_current_uses >= v_invitation.max_uses THEN
    RAISE EXCEPTION 'Ce code d''invitation a atteint la limite d''utilisations';
  END IF;

  v_group_id := v_invitation.group_id;

  -- Vérifier que l'utilisateur n'est pas déjà membre
  IF EXISTS (SELECT 1 FROM group_members WHERE group_id = v_group_id AND user_id = v_user_id) THEN
    RETURN v_group_id;
  END IF;

  -- Ajouter l'utilisateur au groupe
  INSERT INTO group_members (group_id, user_id, role)
  VALUES (v_group_id, v_user_id, 'member')
  ON CONFLICT (group_id, user_id) DO NOTHING;

  -- Incrémenter le compteur d'utilisations
  UPDATE invitations
  SET uses = COALESCE(uses, 0) + 1,
      used_by = v_user_id,
      used_at = NOW(),
      used = CASE WHEN COALESCE(reusable, false) = false THEN true ELSE used END
  WHERE id = v_invitation.id;

  RETURN v_group_id;
END;
$$;

-- 3) Rendre le code réutilisable disponible pour tous les groupes
CREATE OR REPLACE FUNCTION get_or_create_group_invite_code(p_group_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID;
  v_code TEXT;
BEGIN
  -- Récupérer l'ID de l'utilisateur actuel
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Utilisateur non authentifié';
  END IF;

  -- Vérifier que l'utilisateur est membre du groupe
  IF NOT EXISTS (
    SELECT 1 FROM group_members
    WHERE group_id = p_group_id AND user_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'Vous n''êtes pas membre de ce groupe';
  END IF;

  -- Récupérer le code réutilisable existant
  SELECT code INTO v_code
  FROM invitations
  WHERE group_id = p_group_id
    AND reusable = true
  LIMIT 1;

  -- Si aucun code n'existe, en créer un
  IF v_code IS NULL THEN
    v_code := generate_invite_code();
    INSERT INTO invitations (
      group_id,
      code,
      created_by,
      reusable,
      used,
      uses,
      max_uses
    )
    VALUES (
      p_group_id,
      v_code,
      v_user_id,
      true,
      false,
      0,
      NULL
    )
    ON CONFLICT (code) DO NOTHING;

    IF NOT FOUND THEN
      SELECT code INTO v_code
      FROM invitations
      WHERE group_id = p_group_id
        AND reusable = true
      LIMIT 1;
    END IF;
  END IF;

  RETURN v_code;
END;
$$;

COMMENT ON FUNCTION get_or_create_group_invite_code IS
  'Récupère ou crée le code d''invitation réutilisable pour un groupe (tous types)';
