-- Script de test pour les notifications
-- Exécutez d'abord ces requêtes pour obtenir vos UUIDs, puis utilisez-les dans l'INSERT

-- 1. Récupérer votre user_id (remplacez par votre email)
SELECT id, display_name, email 
FROM profiles 
WHERE email = 'VOTRE_EMAIL@example.com'
LIMIT 1;

-- 2. Récupérer un group_id
SELECT id, name 
FROM groups 
LIMIT 1;

-- 3. Une fois que vous avez vos UUIDs, utilisez cette requête pour créer un notification_job de test
-- Remplacez 'VOTRE_USER_ID' et 'VOTRE_GROUP_ID' par les UUIDs obtenus ci-dessus
INSERT INTO notification_jobs (kind, recipients, group_id, payload)
VALUES (
  'test',
  ARRAY['VOTRE_USER_ID']::uuid[],  -- Cast en uuid[]
  'VOTRE_GROUP_ID'::uuid,           -- Cast en uuid
  '{"title": "Test notification", "message": "Ceci est un test de notification push"}'::jsonb
);

-- 4. Vérifier que le job a été créé
SELECT * FROM notification_jobs ORDER BY created_at DESC LIMIT 5;

-- 5. Vérifier que le trigger a appelé dispatch-notifs
-- (Vérifiez dans Edge Functions > dispatch-notifs > Logs)

