-- Migration: Recréer les vues avec SECURITY DEFINER pour corriger les erreurs du linter
-- Date: 2025-01-04
-- 
-- IMPORTANT: Cette migration doit être complétée avec les définitions réelles des vues
-- 
-- Pour obtenir les définitions:
-- 1. Exécutez get_view_definitions.sql dans le SQL Editor
-- 2. Copiez les définitions obtenues
-- 3. Remplacez les placeholders dans cette migration
--
-- Note: Les vues PostgreSQL n'ont pas de propriété SECURITY DEFINER explicite.
-- Le problème vient du fait qu'elles sont créées par un super-admin.
-- Pour corriger, on doit les recréer.

-- ============================================================================
-- INSTRUCTIONS
-- ============================================================================
-- 1. Exécutez d'abord: supabase/migrations/get_view_definitions.sql
-- 2. Copiez les définitions obtenues
-- 3. Remplacez les sections "TODO: Remplacer par la définition réelle" ci-dessous
-- 4. Exécutez cette migration

-- ============================================================================
-- 1. v_slot_ready
-- ============================================================================

-- TODO: Remplacer par la définition réelle obtenue via get_view_definitions.sql
-- DROP VIEW IF EXISTS v_slot_ready CASCADE;
-- CREATE VIEW v_slot_ready AS
-- [COLLER LA DÉFINITION ICI];

-- ============================================================================
-- 2. v_slot_dispo
-- ============================================================================

-- TODO: Remplacer par la définition réelle obtenue via get_view_definitions.sql
-- DROP VIEW IF EXISTS v_slot_dispo CASCADE;
-- CREATE VIEW v_slot_dispo AS
-- [COLLER LA DÉFINITION ICI];

-- ============================================================================
-- 3. v_ready_60
-- ============================================================================

-- TODO: Remplacer par la définition réelle obtenue via get_view_definitions.sql
-- DROP VIEW IF EXISTS v_ready_60 CASCADE;
-- CREATE VIEW v_ready_60 AS
-- [COLLER LA DÉFINITION ICI];

-- ============================================================================
-- 4. v_ready_90
-- ============================================================================

-- TODO: Remplacer par la définition réelle obtenue via get_view_definitions.sql
-- DROP VIEW IF EXISTS v_ready_90 CASCADE;
-- CREATE VIEW v_ready_90 AS
-- [COLLER LA DÉFINITION ICI];

-- ============================================================================
-- 5. v_match_candidates
-- ============================================================================

-- TODO: Remplacer par la définition réelle obtenue via get_view_definitions.sql
-- DROP VIEW IF EXISTS v_match_candidates CASCADE;
-- CREATE VIEW v_match_candidates AS
-- [COLLER LA DÉFINITION ICI];

-- ============================================================================
-- 6. v_slots_ready_4_no_match
-- ============================================================================

-- TODO: Remplacer par la définition réelle obtenue via get_view_definitions.sql
-- DROP VIEW IF EXISTS v_slots_ready_4_no_match CASCADE;
-- CREATE VIEW v_slots_ready_4_no_match AS
-- [COLLER LA DÉFINITION ICI];

-- ============================================================================
-- 7. v_matches_extended
-- ============================================================================

-- TODO: Remplacer par la définition réelle obtenue via get_view_definitions.sql
-- DROP VIEW IF EXISTS v_matches_extended CASCADE;
-- CREATE VIEW v_matches_extended AS
-- [COLLER LA DÉFINITION ICI];

-- ============================================================================
-- 8. v_slots_hot_3_no_match
-- ============================================================================

-- TODO: Remplacer par la définition réelle obtenue via get_view_definitions.sql
-- DROP VIEW IF EXISTS v_slots_hot_3_no_match CASCADE;
-- CREATE VIEW v_slots_hot_3_no_match AS
-- [COLLER LA DÉFINITION ICI];

-- ============================================================================
-- 9. v_match_participants
-- ============================================================================

-- TODO: Remplacer par la définition réelle obtenue via get_view_definitions.sql
-- DROP VIEW IF EXISTS v_match_participants CASCADE;
-- CREATE VIEW v_match_participants AS
-- [COLLER LA DÉFINITION ICI];

-- ============================================================================
-- 10. club_memberships
-- ============================================================================

-- TODO: Remplacer par la définition réelle obtenue via get_view_definitions.sql
-- DROP VIEW IF EXISTS club_memberships CASCADE;
-- CREATE VIEW club_memberships AS
-- [COLLER LA DÉFINITION ICI];

-- ============================================================================
-- NOTES
-- ============================================================================
-- Après avoir rempli toutes les définitions, cette migration recréera toutes
-- les vues sans hériter des permissions du super-admin, ce qui corrigera
-- les erreurs "security_definer_view" du linter.

