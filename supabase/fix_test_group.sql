-- Script pour corriger le groupe de test existant
-- Met le groupe en public/open et crée une fonction RPC pour rejoindre

-- 1. Mettre à jour le groupe existant
UPDATE groups 
SET visibility = 'public', join_policy = 'open' 
WHERE name = 'Groupe de test - 50+ membres';

-- 2. Créer une fonction RPC pour rejoindre un groupe (si elle n'existe pas)
CREATE OR REPLACE FUNCTION join_public_group(p_group_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID;
  v_join_policy TEXT;
  v_visibility TEXT;
BEGIN
  -- Récupérer l'ID de l'utilisateur actuel
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Utilisateur non authentifié';
  END IF;
  
  -- Vérifier que le groupe existe et est public avec join_policy = 'open'
  SELECT visibility, join_policy INTO v_visibility, v_join_policy
  FROM groups
  WHERE id = p_group_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Groupe non trouvé';
  END IF;
  
  IF v_visibility != 'public' OR v_join_policy != 'open' THEN
    RAISE EXCEPTION 'Ce groupe n''accepte pas les nouveaux membres';
  END IF;
  
  -- Vérifier que l'utilisateur n'est pas déjà membre
  IF EXISTS (SELECT 1 FROM group_members WHERE group_id = p_group_id AND user_id = v_user_id) THEN
    RAISE EXCEPTION 'Vous êtes déjà membre de ce groupe';
  END IF;
  
  -- Ajouter l'utilisateur au groupe
  INSERT INTO group_members (group_id, user_id, role)
  VALUES (p_group_id, v_user_id, 'member')
  ON CONFLICT (group_id, user_id) DO NOTHING;
  
  RETURN p_group_id;
END;
$$;

-- 3. Vérifier le résultat
SELECT 
  id,
  name,
  visibility,
  join_policy,
  (SELECT COUNT(*) FROM group_members WHERE group_id = groups.id) as member_count
FROM groups
WHERE name = 'Groupe de test - 50+ membres';

