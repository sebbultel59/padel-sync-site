-- Migration: Ajouter des codes d'invitation réutilisables pour les groupes privés
-- Date: 2025-01-XX
-- Objectif: Un code unique réutilisable par groupe privé au lieu de codes à usage unique

-- 1. Ajouter la colonne 'reusable' à la table invitations
ALTER TABLE invitations 
ADD COLUMN IF NOT EXISTS reusable BOOLEAN DEFAULT false;

-- Commentaire pour documentation
COMMENT ON COLUMN invitations.reusable IS 'Indique si le code peut être réutilisé plusieurs fois (pour les groupes privés)';

-- 2. Créer un index pour les codes réutilisables par groupe
CREATE INDEX IF NOT EXISTS idx_invitations_group_reusable 
ON invitations(group_id, reusable) 
WHERE reusable = true;

-- 3. Modifier la fonction accept_invite pour gérer les codes réutilisables
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
  
  -- Chercher l'invitation par code
  SELECT id, group_id, used, expires_at, reusable
  INTO v_invitation
  FROM invitations
  WHERE code = UPPER(TRIM(p_code))
  LIMIT 1;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Code d''invitation invalide';
  END IF;
  
  -- Pour les codes non réutilisables, vérifier s'ils ont été utilisés
  -- Utiliser COALESCE pour gérer les anciens codes où reusable peut être NULL
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
  -- Utiliser COALESCE pour gérer les anciens codes où reusable peut être NULL
  IF COALESCE(v_invitation.reusable, false) = false THEN
    UPDATE invitations
    SET used = true, used_by = v_user_id, used_at = NOW()
    WHERE id = v_invitation.id;
  END IF;
  
  RETURN v_group_id;
END;
$$;

-- 4. Fonction helper pour générer un code unique
CREATE OR REPLACE FUNCTION generate_invite_code()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  v_code TEXT;
  v_exists BOOLEAN;
BEGIN
  LOOP
    -- Générer un code aléatoire de 6 caractères
    v_code := UPPER(
      SUBSTRING(
        MD5(RANDOM()::TEXT || CLOCK_TIMESTAMP()::TEXT),
        1, 6
      )
    );
    
    -- Vérifier si le code existe déjà
    SELECT EXISTS(SELECT 1 FROM invitations WHERE code = v_code) INTO v_exists;
    
    -- Si le code n'existe pas, on peut l'utiliser
    EXIT WHEN NOT v_exists;
  END LOOP;
  
  RETURN v_code;
END;
$$;

-- 5. Modifier rpc_create_group pour créer automatiquement un code réutilisable pour les groupes privés
CREATE OR REPLACE FUNCTION rpc_create_group(
  p_name TEXT,
  p_visibility TEXT,
  p_join_policy TEXT,
  p_club_id UUID DEFAULT NULL,
  p_city TEXT DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  name TEXT,
  visibility TEXT,
  join_policy TEXT,
  club_id UUID,
  city TEXT,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID;
  v_user_role TEXT;
  v_user_club_id UUID;
  v_group_id UUID;
  v_normalized_visibility TEXT;
  v_normalized_join_policy TEXT;
  v_final_club_id UUID;
  v_invite_code TEXT;
BEGIN
  -- Récupérer l'ID de l'utilisateur actuel
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Utilisateur non authentifié';
  END IF;
  
  -- Récupérer le rôle et club_id de l'utilisateur
  SELECT 
    COALESCE(p.role, 'player'),
    p.club_id
  INTO STRICT
    v_user_role,
    v_user_club_id
  FROM public.profiles p
  WHERE p.id = v_user_id;
  
  -- Si le profil n'existe pas ou le rôle est NULL, utiliser 'player' par défaut
  IF v_user_role IS NULL THEN
    v_user_role := 'player';
  END IF;
  
  -- Normaliser les valeurs
  v_normalized_visibility := LOWER(TRIM(p_visibility));
  v_normalized_join_policy := LOWER(TRIM(p_join_policy));
  
  -- Valider les combinaisons visibility/join_policy
  IF v_normalized_visibility = 'private' THEN
    -- Pour les groupes privés, join_policy doit être 'invite'
    -- TOUS les utilisateurs authentifiés peuvent créer des groupes privés
    v_normalized_join_policy := 'invite';
  ELSIF v_normalized_visibility = 'public' THEN
    -- Pour les groupes publics, join_policy doit être 'open', 'request', ou 'invite'
    IF v_normalized_join_policy NOT IN ('open', 'request', 'invite') THEN
      RAISE EXCEPTION 'join_policy invalide pour un groupe public. Valeurs autorisées: open, request, invite';
    END IF;
    
    -- Vérifier les permissions pour créer des groupes publics
    IF v_normalized_join_policy = 'open' THEN
      -- Public ouvert : uniquement super_admin
      IF v_user_role != 'super_admin' THEN
        RAISE EXCEPTION 'Seuls les super admins peuvent créer un groupe public ouvert';
      END IF;
    ELSIF v_normalized_join_policy = 'request' THEN
      -- Public sur demande : super_admin, admin ou club_manager
      IF v_user_role NOT IN ('super_admin', 'admin', 'club_manager') THEN
        RAISE EXCEPTION 'Seuls les admins, super admins et club managers peuvent créer un groupe public sur demande';
      END IF;
    END IF;
  ELSE
    RAISE EXCEPTION 'visibility invalide. Valeurs autorisées: private, public';
  END IF;
  
  -- Gérer le club_id
  IF p_club_id IS NOT NULL THEN
    -- Vérifier que le club existe
    IF NOT EXISTS (SELECT 1 FROM public.clubs c WHERE c.id = p_club_id) THEN
      RAISE EXCEPTION 'Club non trouvé';
    END IF;
    
    -- Vérifier les permissions pour associer un club
    IF v_user_role = 'club_manager' THEN
      -- Un club_manager ne peut créer un groupe que pour son propre club
      IF v_user_club_id != p_club_id THEN
        RAISE EXCEPTION 'Vous ne pouvez créer un groupe que pour votre propre club';
      END IF;
      v_final_club_id := p_club_id;
    ELSIF v_user_role = 'super_admin' THEN
      -- Super admin peut associer n'importe quel club
      v_final_club_id := p_club_id;
    ELSE
      -- Les autres rôles (player, admin) ne peuvent pas associer de club
      -- On ignore le club_id pour les joueurs et admins
      v_final_club_id := NULL;
    END IF;
  ELSE
    v_final_club_id := NULL;
  END IF;
  
  -- Créer le groupe
  v_group_id := gen_random_uuid();
  INSERT INTO public.groups (
    id,
    name,
    visibility,
    join_policy,
    club_id,
    city,
    created_at
  )
  VALUES (
    v_group_id,
    TRIM(p_name),
    v_normalized_visibility,
    v_normalized_join_policy,
    v_final_club_id,
    CASE WHEN p_city IS NOT NULL THEN TRIM(p_city) ELSE NULL END,
    NOW()
  );
  
  -- Ajouter le créateur comme owner du groupe
  INSERT INTO public.group_members (group_id, user_id, role)
  VALUES (v_group_id, v_user_id, 'owner')
  ON CONFLICT (group_id, user_id) DO NOTHING;
  
  -- Pour les groupes privés, créer automatiquement un code d'invitation réutilisable
  IF v_normalized_visibility = 'private' THEN
    v_invite_code := generate_invite_code();
    INSERT INTO invitations (
      group_id,
      code,
      created_by,
      reusable,
      used
    )
    VALUES (
      v_group_id,
      v_invite_code,
      v_user_id,
      true,  -- Code réutilisable
      false  -- Pas encore utilisé (mais peu importe car réutilisable)
    )
    ON CONFLICT (code) DO NOTHING;  -- Au cas où le code existerait déjà (très improbable)
  END IF;
  
  -- Retourner le groupe créé
  RETURN QUERY
  SELECT 
    g.id,
    g.name,
    g.visibility,
    g.join_policy,
    g.club_id,
    g.city,
    g.created_at
  FROM public.groups g
  WHERE g.id = v_group_id;
END;
$$;

-- 6. Mettre à jour les politiques RLS pour permettre de voir les codes réutilisables
DROP POLICY IF EXISTS "Users can view invitations for their groups or unused codes" ON invitations;

CREATE POLICY "Users can view invitations for their groups or unused codes"
  ON invitations
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM group_members gm
      WHERE gm.group_id = invitations.group_id
      AND gm.user_id = auth.uid()
    )
    OR (used = false AND reusable = false)  -- Codes non utilisés et non réutilisables
    OR reusable = true  -- Tous les codes réutilisables (même s'ils ont été "utilisés")
  );

-- 7. Fonction helper pour obtenir ou créer le code d'un groupe privé
CREATE OR REPLACE FUNCTION get_or_create_group_invite_code(p_group_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID;
  v_code TEXT;
  v_is_private BOOLEAN;
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
  
  -- Vérifier que le groupe est privé
  SELECT visibility = 'private' INTO v_is_private
  FROM groups
  WHERE id = p_group_id;
  
  IF NOT v_is_private THEN
    RAISE EXCEPTION 'Cette fonction est uniquement pour les groupes privés';
  END IF;
  
  -- Récupérer le code réutilisable existant
  SELECT code INTO v_code
  FROM invitations
  WHERE group_id = p_group_id
    AND reusable = true
  LIMIT 1;
  
  -- Si aucun code n'existe, en créer un (cas de migration pour groupes existants)
  IF v_code IS NULL THEN
    v_code := generate_invite_code();
    INSERT INTO invitations (
      group_id,
      code,
      created_by,
      reusable,
      used
    )
    VALUES (
      p_group_id,
      v_code,
      v_user_id,
      true,
      false
    )
    ON CONFLICT (code) DO NOTHING;
    
    -- Si l'insertion a échoué à cause d'un conflit, récupérer le code existant
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

-- Permissions
GRANT EXECUTE ON FUNCTION get_or_create_group_invite_code(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION generate_invite_code() TO authenticated;

-- Commentaires
COMMENT ON FUNCTION get_or_create_group_invite_code IS 
  'Récupère ou crée le code d''invitation réutilisable pour un groupe privé';
COMMENT ON FUNCTION generate_invite_code IS 
  'Génère un code d''invitation unique de 6 caractères';

