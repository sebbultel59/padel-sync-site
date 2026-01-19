-- Script pour récupérer les définitions des vues avec SECURITY DEFINER
-- Exécutez ce script dans le SQL Editor de Supabase pour obtenir les définitions
-- Copiez ensuite les résultats dans une migration pour recréer les vues

-- ============================================================================
-- RÉCUPÉRER LES DÉFINITIONS DES VUES
-- ============================================================================

-- 1. v_slot_ready
SELECT 
  'v_slot_ready' as vue_name,
  pg_get_viewdef('v_slot_ready'::regclass, true) as definition;

-- 2. v_slot_dispo
SELECT 
  'v_slot_dispo' as vue_name,
  pg_get_viewdef('v_slot_dispo'::regclass, true) as definition;

-- 3. v_ready_60
SELECT 
  'v_ready_60' as vue_name,
  pg_get_viewdef('v_ready_60'::regclass, true) as definition;

-- 4. v_ready_90
SELECT 
  'v_ready_90' as vue_name,
  pg_get_viewdef('v_ready_90'::regclass, true) as definition;

-- 5. v_match_candidates
SELECT 
  'v_match_candidates' as vue_name,
  pg_get_viewdef('v_match_candidates'::regclass, true) as definition;

-- 6. v_slots_ready_4_no_match
SELECT 
  'v_slots_ready_4_no_match' as vue_name,
  pg_get_viewdef('v_slots_ready_4_no_match'::regclass, true) as definition;

-- 7. v_matches_extended
SELECT 
  'v_matches_extended' as vue_name,
  pg_get_viewdef('v_matches_extended'::regclass, true) as definition;

-- 8. v_slots_hot_3_no_match
SELECT 
  'v_slots_hot_3_no_match' as vue_name,
  pg_get_viewdef('v_slots_hot_3_no_match'::regclass, true) as definition;

-- 9. v_match_participants
SELECT 
  'v_match_participants' as vue_name,
  pg_get_viewdef('v_match_participants'::regclass, true) as definition;

-- 10. club_memberships
SELECT 
  'club_memberships' as vue_name,
  pg_get_viewdef('club_memberships'::regclass, true) as definition;

-- ============================================================================
-- VÉRIFIER QUE LES VUES EXISTENT
-- ============================================================================

SELECT 
  table_name as vue_name,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM information_schema.views 
      WHERE table_schema = 'public' 
      AND table_name = t.table_name
    ) THEN '✅ Existe'
    ELSE '❌ N''existe pas'
  END as statut
FROM (
  VALUES 
    ('v_slot_ready'),
    ('v_slot_dispo'),
    ('v_ready_60'),
    ('v_ready_90'),
    ('v_match_candidates'),
    ('v_slots_ready_4_no_match'),
    ('v_matches_extended'),
    ('v_slots_hot_3_no_match'),
    ('v_match_participants'),
    ('club_memberships')
) AS t(table_name);

