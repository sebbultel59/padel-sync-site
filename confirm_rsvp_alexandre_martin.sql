-- Script SQL pour confirmer la participation d'Alexandre Martin
-- au match cc40bdfe-b6c7-4471-9382-bec83a0b58a1

DO $$
DECLARE
  v_match_id UUID := 'cc40bdfe-b6c7-4471-9382-bec83a0b58a1'::UUID;
  v_alexandre_id UUID;
  v_match_exists BOOLEAN;
  v_match_info RECORD;
BEGIN
  -- 1. Vérifier que le match existe
  SELECT EXISTS(SELECT 1 FROM matches WHERE id = v_match_id) INTO v_match_exists;
  
  IF NOT v_match_exists THEN
    RAISE EXCEPTION 'Match non trouvé avec l''ID: %', v_match_id;
  END IF;
  
  RAISE NOTICE '✅ Match trouvé: %', v_match_id;
  
  -- Afficher les informations du match
  SELECT 
    m.id,
    m.status,
    ts.starts_at,
    ts.ends_at,
    g.name as group_name
  INTO v_match_info
  FROM matches m
  INNER JOIN time_slots ts ON ts.id = m.time_slot_id
  LEFT JOIN groups g ON g.id = m.group_id
  WHERE m.id = v_match_id;
  
  IF v_match_info.starts_at IS NOT NULL THEN
    RAISE NOTICE '   Date: %', v_match_info.starts_at::DATE;
    RAISE NOTICE '   Heure: % - %', 
      TO_CHAR(v_match_info.starts_at::TIME, 'HH24:MI'),
      TO_CHAR(v_match_info.ends_at::TIME, 'HH24:MI');
  END IF;
  
  IF v_match_info.group_name IS NOT NULL THEN
    RAISE NOTICE '   Groupe: %', v_match_info.group_name;
  END IF;
  
  -- 2. Trouver Alexandre Martin
  SELECT p.id INTO v_alexandre_id
  FROM profiles p
  WHERE LOWER(p.display_name) LIKE '%alexandre%martin%'
     OR (LOWER(p.name) LIKE '%alexandre%' AND LOWER(p.name) LIKE '%martin%')
  LIMIT 1;
  
  IF v_alexandre_id IS NULL THEN
    RAISE EXCEPTION 'Joueur Alexandre Martin non trouvé';
  END IF;
  
  RAISE NOTICE '✅ Alexandre Martin trouvé: %', v_alexandre_id;
  
  -- 3. Confirmer la participation
  INSERT INTO match_rsvps (match_id, user_id, status, created_at)
  VALUES (v_match_id, v_alexandre_id, 'accepted', NOW())
  ON CONFLICT (match_id, user_id) 
  DO UPDATE SET 
    status = 'accepted',
    created_at = NOW();
  
  RAISE NOTICE '';
  RAISE NOTICE '✅ Alexandre Martin a confirmé sa participation!';
  RAISE NOTICE '   Match ID: %', v_match_id;
  
END $$;

-- Vérification: Afficher le RSVP confirmé
SELECT 
  p.display_name as joueur,
  p.email,
  mr.status,
  mr.created_at as confirme_le,
  ts.starts_at as match_debut,
  ts.ends_at as match_fin,
  g.name as groupe
FROM match_rsvps mr
INNER JOIN profiles p ON p.id = mr.user_id
INNER JOIN matches m ON m.id = mr.match_id
INNER JOIN time_slots ts ON ts.id = m.time_slot_id
LEFT JOIN groups g ON g.id = m.group_id
WHERE m.id = 'cc40bdfe-b6c7-4471-9382-bec83a0b58a1'::UUID
  AND mr.status = 'accepted'
  AND LOWER(p.display_name) LIKE '%alexandre%martin%'
ORDER BY mr.created_at;









