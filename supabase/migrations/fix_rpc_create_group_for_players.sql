-- Migration: Corriger rpc_create_group pour permettre aux joueurs et admins de créer des groupes privés
-- Date: 2025-01-XX
-- Problème: Les joueurs et admins ne peuvent pas créer de groupes privés à cause d'une erreur de permissions

-- Supprimer la version existante
DROP FUNCTION IF EXISTS rpc_create_group(TEXT, TEXT, TEXT, UUID, TEXT);

-- Recréer la fonction avec une meilleure gestion des rôles
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
BEGIN
  -- Récupérer l'ID de l'utilisateur actuel
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Utilisateur non authentifié';
  END IF;
  
  -- Récupérer le rôle et club_id de l'utilisateur
  -- Utiliser des alias explicites pour éviter toute ambiguïté
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

-- Donner les permissions d'exécution
GRANT EXECUTE ON FUNCTION rpc_create_group(TEXT, TEXT, TEXT, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION rpc_create_group(TEXT, TEXT, TEXT, UUID, TEXT) TO anon;

-- Commentaire pour documentation
COMMENT ON FUNCTION rpc_create_group IS 
  'Crée un nouveau groupe. Permet à tous les utilisateurs authentifiés de créer des groupes privés. Les groupes publics nécessitent des permissions spéciales.';

