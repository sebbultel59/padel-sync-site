-- ============================================
-- VÉRIFIER LES TOKENS EXPO
-- ============================================

-- 1. Vérifier les tokens Expo des membres du club
SELECT 
  'Tokens Expo des membres' as info,
  p.id,
  p.display_name,
  CASE 
    WHEN p.expo_push_token IS NULL THEN '❌ Pas de token'
    WHEN p.expo_push_token LIKE 'ExponentPushToken%' THEN '✅ Token valide'
    ELSE '⚠️ Token invalide: ' || LEFT(p.expo_push_token, 20)
  END as token_status,
  p.expo_push_token
FROM profiles p
INNER JOIN group_members gm ON gm.user_id = p.id
INNER JOIN groups g ON g.id = gm.group_id
WHERE g.club_id = (
  SELECT club_id 
  FROM club_notifications 
  ORDER BY created_at DESC 
  LIMIT 1
)
GROUP BY p.id, p.display_name, p.expo_push_token
ORDER BY p.display_name;

-- 2. Vérifier les destinataires du dernier job
SELECT 
  'Destinataires du dernier job' as info,
  nj.id as job_id,
  nj.kind,
  nj.created_at,
  nj.sent_at,
  unnest(nj.recipients) as recipient_id,
  p.display_name,
  CASE 
    WHEN p.expo_push_token IS NULL THEN '❌ Pas de token'
    WHEN p.expo_push_token LIKE 'ExponentPushToken%' THEN '✅ Token valide'
    ELSE '⚠️ Token invalide'
  END as token_status
FROM notification_jobs nj
LEFT JOIN profiles p ON p.id = ANY(nj.recipients)
WHERE nj.kind = 'club_notification'
ORDER BY nj.created_at DESC
LIMIT 20;

-- 3. Compter les destinataires avec tokens valides pour le dernier job
SELECT 
  'Résumé tokens' as info,
  nj.id as job_id,
  nj.created_at,
  array_length(nj.recipients, 1) as nb_recipients_total,
  COUNT(DISTINCT p.id) FILTER (WHERE p.expo_push_token LIKE 'ExponentPushToken%') as nb_tokens_valides,
  COUNT(DISTINCT p.id) FILTER (WHERE p.expo_push_token IS NULL) as nb_sans_token
FROM notification_jobs nj
LEFT JOIN profiles p ON p.id = ANY(nj.recipients)
WHERE nj.kind = 'club_notification'
AND nj.created_at > NOW() - INTERVAL '1 hour'
GROUP BY nj.id, nj.created_at
ORDER BY nj.created_at DESC
LIMIT 5;

