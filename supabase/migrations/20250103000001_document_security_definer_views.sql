-- Migration: Documentation des vues SECURITY DEFINER
-- Date: 2025-01-03
-- Documente les vues avec SECURITY DEFINER et propose des solutions
--
-- NOTE: Cette migration ne modifie pas les vues existantes pour éviter de casser
-- l'application. Elle documente le problème et propose des solutions futures.
--
-- Vues concernées:
-- - availability_effective (utilisée via get_availability_effective RPC - OK)
-- - v_slot_ready, v_slot_dispo, v_ready_60, v_ready_90
-- - v_match_candidates, v_slots_ready_4_no_match
-- - v_matches_extended, v_slots_hot_3_no_match
-- - v_match_participants
-- - club_memberships

-- ============================================================================
-- PROBLÈME
-- ============================================================================
-- Les vues avec SECURITY DEFINER utilisent les permissions du créateur de la vue
-- plutôt que celles de l'utilisateur qui interroge. Cela peut contourner RLS.
--
-- RISQUE: Moyen à élevé selon l'usage
-- - Si utilisées via fonctions RPC avec validation: risque limité
-- - Si utilisées directement depuis le client: risque élevé

-- ============================================================================
-- SOLUTION RECOMMANDÉE
-- ============================================================================
-- 1. Convertir les vues en fonctions RPC avec validation explicite
-- 2. OU créer des fonctions wrapper qui utilisent SECURITY INVOKER
-- 3. OU s'assurer que les vues ne sont jamais utilisées directement depuis le client

-- ============================================================================
-- VUE: availability_effective
-- ============================================================================
-- ✅ DÉJÀ SÉCURISÉE: Utilisée uniquement via get_availability_effective() RPC
-- La fonction RPC valide les permissions et filtre par group_id
-- Aucune action nécessaire

-- ============================================================================
-- VUES À VÉRIFIER
-- ============================================================================
-- Les vues suivantes doivent être vérifiées pour s'assurer qu'elles ne sont
-- pas utilisées directement depuis le client:
-- - v_slot_ready
-- - v_slot_dispo
-- - v_ready_60
-- - v_ready_90
-- - v_match_candidates
-- - v_slots_ready_4_no_match
-- - v_matches_extended
-- - v_slots_hot_3_no_match
-- - v_match_participants
-- - club_memberships

-- ============================================================================
-- RECOMMANDATION FUTURE
-- ============================================================================
-- Si ces vues sont utilisées directement depuis le client, créer des fonctions
-- RPC wrapper qui:
-- 1. Valident les permissions de l'utilisateur
-- 2. Appliquent les filtres RLS appropriés
-- 3. Retournent les données filtrées
--
-- Exemple de pattern:
-- CREATE OR REPLACE FUNCTION get_v_slot_ready(p_group_id UUID, p_user_id UUID DEFAULT auth.uid())
-- RETURNS TABLE(...)
-- LANGUAGE plpgsql
-- SECURITY INVOKER  -- Utilise les permissions de l'utilisateur, pas du créateur
-- AS $$
-- BEGIN
--   -- Vérifier que l'utilisateur est membre du groupe
--   IF NOT EXISTS (
--     SELECT 1 FROM group_members
--     WHERE group_id = p_group_id AND user_id = p_user_id
--   ) THEN
--     RAISE EXCEPTION 'User is not a member of this group';
--   END IF;
--   
--   -- Retourner les données filtrées
--   RETURN QUERY
--   SELECT * FROM v_slot_ready
--   WHERE group_id = p_group_id;
-- END;
-- $$;

-- ============================================================================
-- COMMENTAIRES
-- ============================================================================
COMMENT ON VIEW availability_effective IS 
  'Vue SECURITY DEFINER utilisée uniquement via get_availability_effective() RPC. Sécurisée.';

-- Note: Les autres vues ne sont pas modifiées dans cette migration pour éviter
-- de casser l'application. Une migration future devra être créée après vérification
-- de leur utilisation dans le code client.


