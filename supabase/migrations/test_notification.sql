-- Script de test pour les notifications
-- Ce script permet de créer une notification de test et de vérifier qu'elle fonctionne

-- ============================================
-- ÉTAPE 1 : Récupérer vos informations
-- ============================================

-- 1.1 Récupérer votre user_id (remplacez par votre email)
SELECT id, display_name, email, expo_push_token
FROM profiles 
WHERE email = 'sebbultel59@gmail.com'
LIMIT 1;

-- 1.2 Récupérer votre groupe actif
SELECT g.id, g.name, gm.user_id
FROM groups g
INNER JOIN group_members gm ON gm.group_id = g.id
WHERE gm.user_id = (SELECT id FROM profiles WHERE email = 'VOTRE_EMAIL@example.com' LIMIT 1)
LIMIT 1;

-- ============================================
-- ÉTAPE 2 : Créer une notification de test
-- ============================================
-- Remplacez 'VOTRE_USER_ID' et 'VOTRE_GROUP_ID' par les UUIDs obtenus ci-dessus

INSERT INTO notification_jobs (kind, recipients, group_id, payload, created_at)
VALUES (
  'test',
  ARRAY['VOTRE_USER_ID']::uuid[],  -- Cast en uuid[]
  'VOTRE_GROUP_ID'::uuid,           -- Cast en uuid
  '{"title": "🧪 Test de notification", "message": "Ceci est un test de notification push. Si vous voyez ce message, les notifications fonctionnent correctement !"}'::jsonb,
  NOW()
)
RETURNING *;

-- ============================================
-- ÉTAPE 3 : Vérifications
-- ============================================

-- 3.1 Vérifier que le job a été créé
SELECT 
  id,
  kind,
  recipients,
  group_id,
  payload,
  created_at,
  sent_at
FROM notification_jobs 
ORDER BY created_at DESC 
LIMIT 5;

-- 3.2 Vérifier que votre token push est enregistré
SELECT id, display_name, email, 
       CASE 
         WHEN expo_push_token IS NOT NULL THEN '✅ Token enregistré'
         ELSE '❌ Aucun token'
       END as token_status,
       LEFT(expo_push_token, 30) || '...' as token_preview
FROM profiles 
WHERE id = 'VOTRE_USER_ID';

-- 3.3 Vérifier les notifications non envoyées (devraient être traitées rapidement)
SELECT 
  COUNT(*) as notifications_en_attente,
  MIN(created_at) as plus_ancienne,
  MAX(created_at) as plus_recente
FROM notification_jobs
WHERE sent_at IS NULL;

-- 3.4 Vérifier les notifications envoyées récemment
SELECT 
  COUNT(*) as notifications_envoyees,
  MIN(sent_at) as premiere_envoyee,
  MAX(sent_at) as derniere_envoyee
FROM notification_jobs
WHERE sent_at IS NOT NULL
  AND sent_at > NOW() - INTERVAL '1 hour';

-- ============================================
-- ÉTAPE 4 : Nettoyage (optionnel)
-- ============================================
-- Supprimer les notifications de test anciennes (plus de 1 jour)
-- DELETE FROM notification_jobs 
-- WHERE kind = 'test' 
--   AND created_at < NOW() - INTERVAL '1 day';

-- ============================================
-- NOTES
-- ============================================
-- 1. Après avoir créé la notification, elle devrait être traitée automatiquement
--    par la fonction dispatch-notifs (via webhook, trigger ou cron)
-- 2. Vérifiez les logs dans Supabase Dashboard > Edge Functions > dispatch-notifs > Logs
-- 3. La notification devrait apparaître dans l'app dans la liste des notifications
-- 4. Si vous avez les permissions activées, vous devriez recevoir une notification push

