-- ============================================
-- CORRECTION DES PERMISSIONS POUR notification_jobs
-- ============================================

-- La fonction process_club_notification utilise SECURITY DEFINER,
-- mais il faut s'assurer que notification_jobs permet l'INSERT

-- 1. Vérifier si RLS est activé sur notification_jobs
SELECT 
  tablename,
  rowsecurity as rls_enabled
FROM pg_tables
WHERE tablename = 'notification_jobs'
AND schemaname = 'public';

-- 2. Vérifier les politiques RLS existantes
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE tablename = 'notification_jobs';

-- 3. Créer une politique qui permet aux fonctions SECURITY DEFINER d'insérer
-- (même si SECURITY DEFINER devrait contourner RLS, on s'assure que ça fonctionne)

-- D'abord, vérifier si la table existe et a les bonnes colonnes
DO $$
BEGIN
  -- Vérifier que la table existe
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'notification_jobs'
  ) THEN
    RAISE EXCEPTION 'La table notification_jobs n''existe pas';
  END IF;
  
  RAISE NOTICE '✅ Table notification_jobs existe';
END $$;

-- 4. S'assurer que les fonctions SECURITY DEFINER peuvent insérer
-- Créer une politique permissive pour les fonctions
DROP POLICY IF EXISTS "Functions can insert notification jobs" ON notification_jobs;
CREATE POLICY "Functions can insert notification jobs"
  ON notification_jobs
  FOR INSERT
  WITH CHECK (true);  -- Permet à toutes les fonctions SECURITY DEFINER d'insérer

-- 5. Vérifier que la fonction a bien SECURITY DEFINER
SELECT 
  proname as function_name,
  prosecdef as security_definer,
  CASE 
    WHEN prosecdef THEN '✅ SECURITY DEFINER'
    ELSE '❌ Pas SECURITY DEFINER'
  END as status
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
AND p.proname = 'process_club_notification';

-- ============================================
-- TEST : Vérifier que l'insertion fonctionne
-- ============================================
-- Testez manuellement avec un INSERT direct (remplacez les UUIDs)
/*
DO $$
DECLARE
  v_test_id UUID;
BEGIN
  -- Test d'insertion directe
  INSERT INTO notification_jobs (
    kind,
    recipients,
    payload,
    created_at
  )
  VALUES (
    'test',
    ARRAY['00000000-0000-0000-0000-000000000001'::UUID],
    '{"test": true}'::jsonb,
    NOW()
  )
  RETURNING id INTO v_test_id;
  
  RAISE NOTICE '✅ Insertion test réussie: %', v_test_id;
  
  -- Nettoyer
  DELETE FROM notification_jobs WHERE id = v_test_id;
END $$;
*/

