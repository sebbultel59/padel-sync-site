-- Script de diagnostic pour les notifications de club
-- Vérifie que tout est en place pour que les notifications fonctionnent

-- 1. Vérifier que le trigger existe
SELECT 
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM pg_trigger 
      WHERE tgname = 'club_notifications_to_jobs_trigger'
    ) THEN '✅ Trigger existe'
    ELSE '❌ Trigger manquant'
  END as trigger_status;

-- 2. Vérifier que la fonction existe
SELECT 
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM pg_proc p
      JOIN pg_namespace n ON p.pronamespace = n.oid
      WHERE n.nspname = 'public'
      AND p.proname = 'process_club_notification'
    ) THEN '✅ Fonction existe'
    ELSE '❌ Fonction manquante'
  END as function_status;

-- 3. Vérifier les notifications de club existantes
SELECT 
  COUNT(*) as total_notifications,
  MAX(created_at) as derniere_notification
FROM club_notifications;

-- 4. Vérifier les groupes avec club_id
SELECT 
  COUNT(*) as groupes_avec_club,
  COUNT(DISTINCT club_id) as clubs_differents
FROM groups
WHERE club_id IS NOT NULL;

-- 5. Vérifier les membres des groupes de clubs
SELECT 
  g.club_id,
  c.name as club_name,
  COUNT(DISTINCT gm.user_id) as nombre_membres
FROM groups g
INNER JOIN group_members gm ON gm.group_id = g.id
LEFT JOIN clubs c ON c.id = g.club_id
WHERE g.club_id IS NOT NULL
GROUP BY g.club_id, c.name
ORDER BY nombre_membres DESC;

-- 6. Vérifier les notification_jobs créés récemment
SELECT 
  COUNT(*) as total_jobs,
  COUNT(CASE WHEN kind = 'club_notification' THEN 1 END) as jobs_club_notification,
  MAX(created_at) as dernier_job
FROM notification_jobs;

-- 7. Tester manuellement la fonction (remplacer par un ID réel de club_notification)
-- SELECT process_club_notification() FROM club_notifications LIMIT 1;

-- 8. Vérifier les dernières notifications de club avec leurs détails
SELECT 
  cn.id,
  cn.club_id,
  c.name as club_name,
  cn.message,
  cn.created_at,
  cn.created_by,
  p.display_name as created_by_name
FROM club_notifications cn
LEFT JOIN clubs c ON c.id = cn.club_id
LEFT JOIN profiles p ON p.id = cn.created_by
ORDER BY cn.created_at DESC
LIMIT 5;

