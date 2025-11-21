-- Script de diagnostic pour les notifications
-- Exécutez ce script pour vérifier pourquoi les notifications n'apparaissent pas

-- 1. Vérifier que la fonction RPC existe
SELECT 
  proname as function_name,
  pronargs as num_args,
  proargtypes::regtype[] as arg_types
FROM pg_proc 
WHERE proname = 'get_user_notifications';

-- 2. Vérifier les notifications récentes dans la table
SELECT 
  id,
  kind,
  recipients,
  group_id,
  created_at,
  sent_at
FROM notification_jobs 
ORDER BY created_at DESC 
LIMIT 10;

-- 3. Vérifier les permissions sur la fonction
SELECT 
  grantee,
  privilege_type
FROM information_schema.routine_privileges 
WHERE routine_name = 'get_user_notifications';

-- 4. Tester la fonction RPC avec un user_id (remplacez par votre user_id)
-- SELECT * FROM get_user_notifications('VOTRE_USER_ID'::uuid, 10);

-- 5. Vérifier les politiques RLS sur notification_jobs
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

