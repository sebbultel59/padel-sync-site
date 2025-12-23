-- Script de correction pour mettre à jour le statut des matchs en 'confirmed'
-- Pour les matchs de la semaine du 8 au 14 décembre 2024 dans le groupe "50+"

DO $$
DECLARE
  test_group_id UUID;
  updated_count INTEGER := 0;
BEGIN
  -- 1. Trouver le groupe de test "50+"
  SELECT id INTO test_group_id
  FROM groups
  WHERE name ILIKE '%50+%' OR name ILIKE '%test%50%' OR name = 'Groupe de test - 50+'
  LIMIT 1;
  
  IF test_group_id IS NULL THEN
    RAISE EXCEPTION 'Groupe "50+" non trouvé';
  END IF;
  
  RAISE NOTICE '✅ Groupe trouvé: %', test_group_id;
  
  -- 2. Mettre à jour tous les matchs de la semaine du 8 au 14 décembre avec le statut 'confirmed'
  UPDATE matches m
  SET status = 'confirmed'
  FROM time_slots ts
  WHERE m.time_slot_id = ts.id
    AND m.group_id = test_group_id
    AND ts.starts_at >= '2024-12-08'::date
    AND ts.starts_at < '2024-12-15'::date
    AND (m.status IS NULL OR m.status != 'confirmed');
  
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  
  RAISE NOTICE '✅ % match(s) mis à jour avec le statut "confirmed"', updated_count;
  
END $$;

-- Vérifier les matchs après correction
SELECT 
  m.id as match_id,
  m.status,
  ts.starts_at,
  ts.ends_at,
  COUNT(mr.user_id) FILTER (WHERE mr.status = 'accepted') as confirmed_players
FROM matches m
JOIN time_slots ts ON ts.id = m.time_slot_id
LEFT JOIN match_rsvps mr ON mr.match_id = m.id AND mr.status = 'accepted'
WHERE m.group_id = (SELECT id FROM groups WHERE name ILIKE '%50+%' OR name ILIKE '%test%50%' OR name = 'Groupe de test - 50+' LIMIT 1)
  AND ts.starts_at >= '2024-12-08'::date
  AND ts.starts_at < '2024-12-15'::date
GROUP BY m.id, m.status, ts.starts_at, ts.ends_at
ORDER BY ts.starts_at;









