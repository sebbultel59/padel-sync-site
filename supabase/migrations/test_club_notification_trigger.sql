-- Script de test pour vérifier que le trigger fonctionne
-- À exécuter après avoir créé une notification de club

-- 1. Vérifier que le trigger existe
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_trigger 
    WHERE tgname = 'club_notifications_to_jobs_trigger'
  ) THEN
    RAISE NOTICE '✅ Trigger existe';
  ELSE
    RAISE WARNING '❌ Trigger MANQUANT - Exécutez trigger_club_notifications_to_jobs.sql';
  END IF;
END $$;

-- 2. Vérifier que la fonction existe
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
    AND p.proname = 'process_club_notification'
  ) THEN
    RAISE NOTICE '✅ Fonction existe';
  ELSE
    RAISE WARNING '❌ Fonction MANQUANTE - Exécutez trigger_club_notifications_to_jobs.sql';
  END IF;
END $$;

-- 3. Vérifier les dernières notifications de club
SELECT 
  'Dernières notifications de club:' as info,
  cn.id,
  cn.club_id,
  c.name as club_name,
  LEFT(cn.message, 50) as message_preview,
  cn.created_at
FROM club_notifications cn
LEFT JOIN clubs c ON c.id = cn.club_id
ORDER BY cn.created_at DESC
LIMIT 5;

-- 4. Pour chaque notification de club, vérifier s'il y a des groupes avec club_id
SELECT 
  'Groupes pour chaque club:' as info,
  cn.id as notification_id,
  cn.club_id,
  c.name as club_name,
  COUNT(DISTINCT g.id) as nombre_groupes,
  COUNT(DISTINCT gm.user_id) as nombre_membres_total
FROM club_notifications cn
LEFT JOIN clubs c ON c.id = cn.club_id
LEFT JOIN groups g ON g.club_id = cn.club_id
LEFT JOIN group_members gm ON gm.group_id = g.id
GROUP BY cn.id, cn.club_id, c.name
ORDER BY cn.created_at DESC
LIMIT 5;

-- 5. Test manuel : créer une notification de test et voir si le trigger se déclenche
-- Décommentez et remplacez les UUIDs par des valeurs réelles
/*
DO $$
DECLARE
  v_club_id UUID := 'VOTRE_CLUB_ID';
  v_user_id UUID := 'VOTRE_USER_ID';
  v_notification_id UUID;
BEGIN
  -- Créer une notification de test
  INSERT INTO club_notifications (club_id, message, created_by)
  VALUES (v_club_id, 'Test notification', v_user_id)
  RETURNING id INTO v_notification_id;
  
  RAISE NOTICE 'Notification de test créée: %', v_notification_id;
  
  -- Vérifier si un job a été créé
  IF EXISTS (
    SELECT 1 FROM notification_jobs 
    WHERE kind = 'club_notification' 
    AND payload->>'club_id' = v_club_id::text
  ) THEN
    RAISE NOTICE '✅ Job créé avec succès !';
  ELSE
    RAISE WARNING '❌ Aucun job créé - Vérifiez les logs ou les groupes du club';
  END IF;
END $$;
*/

