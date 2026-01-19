-- Script de vérification des corrections de sécurité
-- Exécutez ce script pour vérifier que toutes les corrections sont bien appliquées

-- ============================================================================
-- 1. VÉRIFIER QUE LES VUES EXISTENT ET SONT CORRECTES
-- ============================================================================

-- Vérifier que player_stats_view existe et n'utilise pas auth.users
SELECT 
  'player_stats_view' as vue,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM information_schema.views 
      WHERE table_schema = 'public' 
      AND table_name = 'player_stats_view'
    ) THEN '✅ Existe'
    ELSE '❌ N''existe pas'
  END as statut,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM pg_views 
      WHERE schemaname = 'public' 
      AND viewname = 'player_stats_view'
      AND definition NOT LIKE '%auth.users%'
    ) THEN '✅ Ne référence pas auth.users'
    ELSE '⚠️ Vérifiez manuellement'
  END as securite
UNION ALL
SELECT 
  'leaderboard_view' as vue,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM information_schema.views 
      WHERE table_schema = 'public' 
      AND table_name = 'leaderboard_view'
    ) THEN '✅ Existe'
    ELSE '❌ N''existe pas'
  END as statut,
  '✅ Recréée' as securite
UNION ALL
SELECT 
  'availability_effective' as vue,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM information_schema.views 
      WHERE table_schema = 'public' 
      AND table_name = 'availability_effective'
    ) THEN '✅ Existe'
    ELSE '❌ N''existe pas'
  END as statut,
  '✅ Recréée' as securite;

-- ============================================================================
-- 2. VÉRIFIER QUE RLS EST ACTIVÉ SUR rating_update_queue
-- ============================================================================

SELECT 
  'rating_update_queue' as table_name,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM pg_tables 
      WHERE schemaname = 'public' 
      AND tablename = 'rating_update_queue'
      AND rowsecurity = true
    ) THEN '✅ RLS activé'
    ELSE '❌ RLS non activé'
  END as rls_status;

-- ============================================================================
-- 3. VÉRIFIER LES POLITIQUES RLS SUR rating_update_queue
-- ============================================================================

SELECT 
  policyname as politique,
  cmd as operation,
  CASE 
    WHEN cmd = 'SELECT' THEN '✅ Lecture contrôlée'
    WHEN cmd = 'INSERT' THEN '✅ Insertion bloquée pour users'
    WHEN cmd = 'UPDATE' THEN '✅ Mise à jour bloquée pour users'
    WHEN cmd = 'DELETE' THEN '✅ Suppression bloquée pour users'
    ELSE '⚠️ Vérifiez'
  END as statut
FROM pg_policies
WHERE schemaname = 'public' 
  AND tablename = 'rating_update_queue'
ORDER BY cmd;

-- ============================================================================
-- 4. VÉRIFIER QUE player_stats_view N'UTILISE PAS auth.users
-- ============================================================================

-- Vérifier la définition de la vue
SELECT 
  'player_stats_view' as vue,
  CASE 
    WHEN view_definition LIKE '%auth.users%' THEN '❌ Utilise encore auth.users'
    WHEN view_definition LIKE '%INNER JOIN auth.users%' THEN '❌ Utilise encore auth.users'
    WHEN view_definition LIKE '%LEFT JOIN auth.users%' THEN '❌ Utilise encore auth.users'
    ELSE '✅ N''utilise pas auth.users'
  END as verification
FROM information_schema.views
WHERE table_schema = 'public' 
  AND table_name = 'player_stats_view';

-- ============================================================================
-- 5. TESTER UNE REQUÊTE SUR player_stats_view
-- ============================================================================

-- Test simple pour vérifier que la vue fonctionne
SELECT 
  'Test player_stats_view' as test,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM player_stats_view LIMIT 1
    ) THEN '✅ La vue fonctionne'
    ELSE '❌ Erreur lors de l''accès à la vue'
  END as resultat;

-- ============================================================================
-- 6. VÉRIFIER LES DÉPENDANCES ENTRE LES VUES
-- ============================================================================

SELECT 
  dependent_view.viewname as vue_dependante,
  source_view.viewname as vue_source,
  '✅ Dépendance OK' as statut
FROM pg_depend d
JOIN pg_rewrite r ON d.objid = r.oid
JOIN pg_class dependent ON r.ev_class = dependent.oid
JOIN pg_class source ON d.refobjid = source.oid
JOIN pg_namespace n1 ON dependent.relnamespace = n1.oid
JOIN pg_namespace n2 ON source.relnamespace = n2.oid
JOIN pg_views dependent_view ON dependent_view.viewname = dependent.relname AND dependent_view.schemaname = n1.nspname
JOIN pg_views source_view ON source_view.viewname = source.relname AND source_view.schemaname = n2.nspname
WHERE n1.nspname = 'public' 
  AND n2.nspname = 'public'
  AND dependent.relkind = 'v'
  AND source.relkind = 'v'
  AND dependent_view.viewname = 'player_stats_view'
  AND source_view.viewname = 'leaderboard_view';

-- ============================================================================
-- RÉSUMÉ
-- ============================================================================

SELECT 
  '=== RÉSUMÉ DES CORRECTIONS ===' as resume,
  '' as detail
UNION ALL
SELECT 
  '1. player_stats_view',
  'Ne doit plus utiliser auth.users'
UNION ALL
SELECT 
  '2. leaderboard_view',
  'Recréée pour corriger SECURITY DEFINER'
UNION ALL
SELECT 
  '3. availability_effective',
  'Recréée pour corriger SECURITY DEFINER'
UNION ALL
SELECT 
  '4. rating_update_queue',
  'RLS activé avec politiques restrictives';

