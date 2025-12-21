-- Migration: Corriger les codes existants pour les groupes privés
-- Date: 2025-01-XX
-- Objectif: Marquer les codes des groupes privés comme réutilisables et réinitialiser leur statut

-- 1. Marquer tous les codes des groupes privés comme réutilisables
UPDATE invitations i
SET reusable = true
FROM groups g
WHERE i.group_id = g.id
  AND g.visibility = 'private'
  AND (i.reusable IS NULL OR i.reusable = false);

-- 2. Réinitialiser le statut 'used' pour les codes réutilisables des groupes privés
-- (car ils doivent pouvoir être réutilisés)
UPDATE invitations i
SET used = false, used_by = NULL, used_at = NULL
FROM groups g
WHERE i.group_id = g.id
  AND g.visibility = 'private'
  AND i.reusable = true
  AND i.used = true;

-- 3. S'assurer qu'il n'y a qu'un seul code réutilisable par groupe privé
-- Supprimer les codes en double (garder le plus ancien)
DELETE FROM invitations i1
USING invitations i2, groups g
WHERE i1.group_id = i2.group_id
  AND i1.group_id = g.id
  AND g.visibility = 'private'
  AND i1.reusable = true
  AND i2.reusable = true
  AND i1.id < i2.id  -- Garder le plus ancien (id plus petit)
  AND i1.group_id = g.id;

-- 4. Créer un code réutilisable pour les groupes privés qui n'en ont pas
INSERT INTO invitations (group_id, code, created_by, reusable, used)
SELECT 
  g.id,
  UPPER(SUBSTRING(MD5(RANDOM()::TEXT || CLOCK_TIMESTAMP()::TEXT || g.id::TEXT), 1, 6)),
  gm.user_id,
  true,
  false
FROM groups g
INNER JOIN group_members gm ON g.id = gm.group_id
WHERE g.visibility = 'private'
  AND gm.role IN ('owner', 'admin')
  AND NOT EXISTS (
    SELECT 1 FROM invitations i 
    WHERE i.group_id = g.id 
    AND i.reusable = true
  )
ON CONFLICT (code) DO NOTHING;  -- Si le code existe déjà, ne rien faire

-- 5. Vérifier et corriger la fonction accept_invite pour s'assurer qu'elle gère bien les codes réutilisables
CREATE OR REPLACE FUNCTION accept_invite(p_code TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID;
  v_invitation RECORD;
  v_group_id UUID;
BEGIN
  -- Récupérer l'ID de l'utilisateur actuel
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Utilisateur non authentifié';
  END IF;
  
  -- Chercher l'invitation par code (inclure reusable dans la sélection)
  SELECT id, group_id, used, expires_at, reusable
  INTO v_invitation
  FROM invitations
  WHERE code = UPPER(TRIM(p_code))
  LIMIT 1;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Code d''invitation invalide';
  END IF;
  
  -- Pour les codes non réutilisables, vérifier s'ils ont été utilisés
  -- Pour les codes réutilisables, ignorer le statut 'used'
  IF COALESCE(v_invitation.reusable, false) = false AND v_invitation.used THEN
    RAISE EXCEPTION 'Ce code d''invitation a déjà été utilisé';
  END IF;
  
  -- Vérifier si le code a expiré
  IF v_invitation.expires_at IS NOT NULL AND v_invitation.expires_at < NOW() THEN
    RAISE EXCEPTION 'Ce code d''invitation a expiré';
  END IF;
  
  v_group_id := v_invitation.group_id;
  
  -- Vérifier que l'utilisateur n'est pas déjà membre
  IF EXISTS (SELECT 1 FROM group_members WHERE group_id = v_group_id AND user_id = v_user_id) THEN
    -- Déjà membre, retourner le group_id sans marquer le code comme utilisé
    -- (car il peut être réutilisable)
    RETURN v_group_id;
  END IF;
  
  -- Ajouter l'utilisateur au groupe
  INSERT INTO group_members (group_id, user_id, role)
  VALUES (v_group_id, v_user_id, 'member')
  ON CONFLICT (group_id, user_id) DO NOTHING;
  
  -- Marquer le code comme utilisé UNIQUEMENT s'il n'est pas réutilisable
  -- Pour les codes réutilisables, on ne touche pas au statut 'used'
  IF COALESCE(v_invitation.reusable, false) = false THEN
    UPDATE invitations
    SET used = true, used_by = v_user_id, used_at = NOW()
    WHERE id = v_invitation.id;
  END IF;
  
  RETURN v_group_id;
END;
$$;

-- Commentaire
COMMENT ON FUNCTION accept_invite IS 
  'Accepte une invitation par code. Les codes réutilisables (groupes privés) peuvent être utilisés plusieurs fois.';

