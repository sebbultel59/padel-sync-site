-- Script SQL pour confirmer la participation de Sophie Bernard, Emma Petit, Chloé Lefebvre
-- pour le match du lundi 29 décembre 2025 de 13:00 à 14:30
-- Avec un délai de 5 secondes entre chaque confirmation

DO $$
DECLARE
  v_match_id UUID := '541c5111-3aaa-47a6-80cf-184fe6e46a5d'::UUID;
  v_sophie_id UUID;
  v_emma_id UUID;
  v_chloe_id UUID;
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
  
  -- 2. Trouver Sophie Bernard
  SELECT p.id INTO v_sophie_id
  FROM profiles p
  WHERE LOWER(p.display_name) LIKE '%sophie%bernard%'
     OR (LOWER(p.name) LIKE '%sophie%' AND LOWER(p.name) LIKE '%bernard%')
  LIMIT 1;
  
  IF v_sophie_id IS NULL THEN
    RAISE EXCEPTION 'Joueuse Sophie Bernard non trouvée';
  END IF;
  
  RAISE NOTICE '✅ Sophie Bernard trouvée: %', v_sophie_id;
  
  -- 3. Trouver Emma Petit
  SELECT p.id INTO v_emma_id
  FROM profiles p
  WHERE LOWER(p.display_name) LIKE '%emma%petit%'
     OR (LOWER(p.name) LIKE '%emma%' AND LOWER(p.name) LIKE '%petit%')
  LIMIT 1;
  
  IF v_emma_id IS NULL THEN
    RAISE EXCEPTION 'Joueuse Emma Petit non trouvée';
  END IF;
  
  RAISE NOTICE '✅ Emma Petit trouvée: %', v_emma_id;
  
  -- 4. Trouver Chloé Lefebvre
  SELECT p.id INTO v_chloe_id
  FROM profiles p
  WHERE LOWER(p.display_name) LIKE '%chloé%lefebvre%'
     OR LOWER(p.display_name) LIKE '%chloe%lefebvre%'
     OR (LOWER(p.name) LIKE '%chloé%' AND LOWER(p.name) LIKE '%lefebvre%')
     OR (LOWER(p.name) LIKE '%chloe%' AND LOWER(p.name) LIKE '%lefebvre%')
  LIMIT 1;
  
  IF v_chloe_id IS NULL THEN
    RAISE EXCEPTION 'Joueuse Chloé Lefebvre non trouvée';
  END IF;
  
  RAISE NOTICE '✅ Chloé Lefebvre trouvée: %', v_chloe_id;
  
  RAISE NOTICE '';
  RAISE NOTICE '🔄 Début des confirmations avec délai de 5 secondes entre chaque...';
  RAISE NOTICE '';
  
  -- 5. Confirmer Sophie Bernard
  INSERT INTO match_rsvps (match_id, user_id, status, created_at)
  VALUES (v_match_id, v_sophie_id, 'accepted', NOW())
  ON CONFLICT (match_id, user_id) 
  DO UPDATE SET 
    status = 'accepted',
    created_at = NOW();
  
  RAISE NOTICE '✅ Sophie Bernard a confirmé sa participation';
  RAISE NOTICE '   Attente de 5 secondes...';
  
  -- Attendre 5 secondes
  PERFORM pg_sleep(5);
  
  -- 6. Confirmer Emma Petit
  INSERT INTO match_rsvps (match_id, user_id, status, created_at)
  VALUES (v_match_id, v_emma_id, 'accepted', NOW())
  ON CONFLICT (match_id, user_id) 
  DO UPDATE SET 
    status = 'accepted',
    created_at = NOW();
  
  RAISE NOTICE '✅ Emma Petit a confirmé sa participation';
  RAISE NOTICE '   Attente de 5 secondes...';
  
  -- Attendre 5 secondes
  PERFORM pg_sleep(5);
  
  -- 7. Confirmer Chloé Lefebvre
  INSERT INTO match_rsvps (match_id, user_id, status, created_at)
  VALUES (v_match_id, v_chloe_id, 'accepted', NOW())
  ON CONFLICT (match_id, user_id) 
  DO UPDATE SET 
    status = 'accepted',
    created_at = NOW();
  
  RAISE NOTICE '✅ Chloé Lefebvre a confirmé sa participation';
  
  RAISE NOTICE '';
  RAISE NOTICE '✅ Toutes les confirmations ont été effectuées avec succès!';
  RAISE NOTICE '   Match ID: %', v_match_id;
  RAISE NOTICE '   Date: 29 décembre 2025, 13:00 - 14:30';
  RAISE NOTICE '   Confirmations:';
  RAISE NOTICE '     1. Sophie Bernard (délai: 0s)';
  RAISE NOTICE '     2. Emma Petit (délai: 5s)';
  RAISE NOTICE '     3. Chloé Lefebvre (délai: 10s)';
  
END $$;

-- Vérification: Afficher les RSVPs confirmés pour ce match
SELECT 
  p.display_name as joueuse,
  p.email,
  mr.status,
  mr.created_at as confirme_le,
  ts.starts_at as match_debut,
  ts.ends_at as match_fin
FROM match_rsvps mr
INNER JOIN profiles p ON p.id = mr.user_id
INNER JOIN matches m ON m.id = mr.match_id
INNER JOIN time_slots ts ON ts.id = m.time_slot_id
WHERE m.id = '541c5111-3aaa-47a6-80cf-184fe6e46a5d'::UUID
  AND mr.status = 'accepted'
  AND LOWER(p.display_name) IN (
    LOWER('Sophie Bernard'),
    LOWER('Emma Petit'),
    LOWER('Chloé Lefebvre'),
    LOWER('Chloe Lefebvre')
  )
ORDER BY mr.created_at;

