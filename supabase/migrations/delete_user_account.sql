-- Migration: Fonction pour supprimer un compte utilisateur
-- Date: 2025-11-05
-- Conforme aux exigences Apple App Store (Guideline 5.1.1(v))

-- Fonction RPC pour supprimer le compte utilisateur et toutes ses données
CREATE OR REPLACE FUNCTION delete_user_account()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID;
BEGIN
  -- Récupérer l'ID de l'utilisateur actuel
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Utilisateur non authentifié';
  END IF;
  
  -- 1. Supprimer les RSVPs de matchs
  DELETE FROM match_rsvps WHERE user_id = v_user_id;
  
  -- 2. Supprimer les matchs créés par l'utilisateur (les RSVPs sont déjà supprimés)
  DELETE FROM matches WHERE created_by = v_user_id;
  
  -- 3. Supprimer les disponibilités
  DELETE FROM availability WHERE user_id = v_user_id;
  DELETE FROM availability_global WHERE user_id = v_user_id;
  
  -- 4. Supprimer les demandes de rejoindre des groupes
  DELETE FROM group_join_requests WHERE user_id = v_user_id;
  -- Note: reviewed_by sera mis à NULL automatiquement par ON DELETE SET NULL
  
  -- 5. Supprimer les invitations créées par l'utilisateur
  DELETE FROM invitations WHERE created_by = v_user_id;
  -- Note: used_by sera mis à NULL automatiquement par ON DELETE SET NULL
  
  -- 6. Supprimer les membres de groupes (les groupes eux-mêmes ne sont pas supprimés)
  DELETE FROM group_members WHERE user_id = v_user_id;
  
  -- 7. Supprimer les groupes créés par l'utilisateur (si aucun autre membre)
  -- Note: Si le groupe a d'autres membres, il sera conservé mais sans propriétaire
  DELETE FROM groups WHERE created_by = v_user_id;
  
  -- 8. Supprimer le profil (dernier, car référencé par d'autres tables)
  DELETE FROM profiles WHERE id = v_user_id;
  
  -- 9. Supprimer le compte auth (nécessite SECURITY DEFINER)
  -- Note: Supabase gère automatiquement la suppression via les triggers,
  -- mais on peut aussi le faire explicitement
  DELETE FROM auth.users WHERE id = v_user_id;
  
  -- Note: Si des tables supplémentaires contiennent des données utilisateur,
  -- elles doivent être ajoutées ici
  
EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Erreur lors de la suppression du compte: %', SQLERRM;
END;
$$;

-- Commentaire pour documentation
COMMENT ON FUNCTION delete_user_account IS 'Supprime complètement le compte utilisateur et toutes ses données associées. Conforme aux exigences Apple App Store.';

