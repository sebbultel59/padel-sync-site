-- ============================================
-- VÉRIFIER LA STRUCTURE DU PAYLOAD
-- ============================================

-- Afficher les jobs club_notification avec leur payload
SELECT 
  id,
  kind,
  payload,
  payload->>'title' as title_from_payload,
  payload->>'message' as message_from_payload,
  payload->>'club_id' as club_id_from_payload,
  created_at
FROM notification_jobs 
WHERE kind = 'club_notification'
ORDER BY created_at DESC
LIMIT 5;

-- Vérifier toutes les clés du payload
SELECT 
  'Toutes les clés du payload' as info,
  key,
  value,
  jsonb_typeof(value) as value_type
FROM notification_jobs,
LATERAL jsonb_each(payload)
WHERE kind = 'club_notification'
ORDER BY created_at DESC
LIMIT 10;

