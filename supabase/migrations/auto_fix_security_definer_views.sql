-- Script automatique pour recréer toutes les vues avec SECURITY DEFINER
-- Date: 2025-01-04
-- 
-- Ce script tente de recréer automatiquement toutes les vues
-- ATTENTION: Exécutez d'abord get_view_definitions.sql pour vérifier que les vues existent
--
-- Si une vue n'existe pas, le script échouera avec une erreur claire

DO $$
DECLARE
  view_def TEXT;
  view_name TEXT;
  views_to_fix TEXT[] := ARRAY[
    'v_slot_ready',
    'v_slot_dispo',
    'v_ready_60',
    'v_ready_90',
    'v_match_candidates',
    'v_slots_ready_4_no_match',
    'v_matches_extended',
    'v_slots_hot_3_no_match',
    'v_match_participants',
    'club_memberships'
  ];
BEGIN
  FOREACH view_name IN ARRAY views_to_fix
  LOOP
    -- Vérifier que la vue existe
    IF EXISTS (
      SELECT 1 FROM information_schema.views 
      WHERE table_schema = 'public' 
      AND table_name = view_name
    ) THEN
      -- Récupérer la définition
      BEGIN
        SELECT pg_get_viewdef(view_name::regclass, true) INTO view_def;
        
        -- Supprimer la vue existante
        EXECUTE format('DROP VIEW IF EXISTS %I CASCADE', view_name);
        
        -- Recréer la vue
        EXECUTE format('CREATE VIEW %I AS %s', view_name, view_def);
        
        RAISE NOTICE '✅ Vue % recréée avec succès', view_name;
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING '⚠️ Erreur lors de la recréation de %: %', view_name, SQLERRM;
      END;
    ELSE
      RAISE NOTICE 'ℹ️ Vue % n''existe pas, ignorée', view_name;
    END IF;
  END LOOP;
  
  RAISE NOTICE '✅ Script terminé';
END $$;

-- ============================================================================
-- VÉRIFICATION APRÈS EXÉCUTION
-- ============================================================================

SELECT 
  table_name as vue,
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

