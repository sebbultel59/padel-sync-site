-- Script pour créer 3 matchs validés dans le groupe "50+ membres" avec sebbultel59@gmail.com parmi les joueurs
-- Dates :
-- 1. Mardi 23 décembre 2025 de 15h à 16h30
-- 2. Mardi 23 décembre 2025 de 18h à 19h30
-- 3. Mercredi 24 décembre 2025 de 10h à 11h30

DO $$
DECLARE
  test_group_id UUID;
  sebbultel_id UUID;
  v_time_slot_id UUID;
  v_match_id UUID;
  -- Joueurs pour les matchs
  player1_id UUID;
  player2_id UUID;
  player3_id UUID;
  player4_id UUID;
  -- Variables pour les dates
  match_date TIMESTAMPTZ;
  match_end TIMESTAMPTZ;
  match_counter INTEGER := 0;
  match_dates TIMESTAMPTZ[] := ARRAY[
    '2025-12-23 15:00:00+00'::timestamptz,  -- Mardi 23 décembre 15h
    '2025-12-23 18:00:00+00'::timestamptz,  -- Mardi 23 décembre 18h
    '2025-12-24 10:00:00+00'::timestamptz   -- Mercredi 24 décembre 10h
  ];
BEGIN
  -- 1. Trouver le groupe "50+ membres"
  SELECT id INTO test_group_id
  FROM groups
  WHERE name ILIKE '%50+%membres%' OR name ILIKE '%test%50%' OR name = 'Groupe de test - 50+ membres'
  LIMIT 1;
  
  IF test_group_id IS NULL THEN
    RAISE EXCEPTION 'Groupe "50+ membres" non trouvé';
  END IF;
  
  RAISE NOTICE '✅ Groupe trouvé: %', test_group_id;
  
  -- 2. Trouver l'utilisateur sebbultel59@gmail.com
  SELECT id INTO sebbultel_id
  FROM auth.users
  WHERE email = 'sebbultel59@gmail.com'
  LIMIT 1;
  
  IF sebbultel_id IS NULL THEN
    RAISE EXCEPTION 'Utilisateur sebbultel59@gmail.com non trouvé';
  END IF;
  
  -- Vérifier que cet utilisateur est membre du groupe
  IF NOT EXISTS (SELECT 1 FROM group_members WHERE group_id = test_group_id AND user_id = sebbultel_id) THEN
    RAISE EXCEPTION 'L''utilisateur sebbultel59@gmail.com n''est pas membre du groupe';
  END IF;
  
  RAISE NOTICE '✅ Utilisateur trouvé: % (sebbultel59@gmail.com)', sebbultel_id;
  
  -- 3. Récupérer une liste de membres du groupe pour les autres joueurs
  SELECT user_id INTO player1_id
  FROM group_members
  WHERE group_id = test_group_id
    AND user_id != sebbultel_id
  ORDER BY user_id
  LIMIT 1 OFFSET 0;
  
  SELECT user_id INTO player2_id
  FROM group_members
  WHERE group_id = test_group_id
    AND user_id != sebbultel_id
    AND user_id != player1_id
  ORDER BY user_id
  LIMIT 1 OFFSET 0;
  
  SELECT user_id INTO player3_id
  FROM group_members
  WHERE group_id = test_group_id
    AND user_id != sebbultel_id
    AND user_id != player1_id
    AND user_id != player2_id
  ORDER BY user_id
  LIMIT 1 OFFSET 0;
  
  IF player1_id IS NULL OR player2_id IS NULL OR player3_id IS NULL THEN
    RAISE EXCEPTION 'Pas assez de membres dans le groupe (minimum 4 requis, y compris sebbultel59@gmail.com)';
  END IF;
  
  RAISE NOTICE '✅ Joueurs sélectionnés: sebbultel (%), autres: %, %, %', sebbultel_id, player1_id, player2_id, player3_id;
  
  -- ==========================================
  -- CRÉER 3 MATCHS VALIDÉS (status='confirmed' avec 4 RSVPs acceptés)
  -- ==========================================
  RAISE NOTICE '';
  RAISE NOTICE '📋 Création de 3 matchs validés...';
  
  FOR match_counter IN 1..3 LOOP
    match_date := match_dates[match_counter];
    match_end := match_date + INTERVAL '1 hour 30 minutes';
    
    RAISE NOTICE '';
    RAISE NOTICE '📅 Match #%: % -> %', match_counter, match_date, match_end;
    
    -- Créer ou récupérer un time_slot
    BEGIN
      SELECT id INTO v_time_slot_id
      FROM time_slots
      WHERE ABS(EXTRACT(EPOCH FROM (starts_at - match_date))) < 60
        AND ABS(EXTRACT(EPOCH FROM (ends_at - match_end))) < 60
        AND (group_id = test_group_id OR group_id IS NULL)
      LIMIT 1;
    EXCEPTION WHEN undefined_column THEN
      SELECT id INTO v_time_slot_id
      FROM time_slots
      WHERE ABS(EXTRACT(EPOCH FROM (starts_at - match_date))) < 60
        AND ABS(EXTRACT(EPOCH FROM (ends_at - match_end))) < 60
      LIMIT 1;
    END;
    
    IF v_time_slot_id IS NULL THEN
      v_time_slot_id := gen_random_uuid();
      BEGIN
        INSERT INTO time_slots (id, group_id, starts_at, ends_at)
        VALUES (v_time_slot_id, test_group_id, match_date, match_end);
      EXCEPTION WHEN undefined_column THEN
        INSERT INTO time_slots (id, starts_at, ends_at)
        VALUES (v_time_slot_id, match_date, match_end);
      END;
      RAISE NOTICE '  ✅ Time slot créé: %', v_time_slot_id;
    ELSE
      RAISE NOTICE '  ℹ️  Time slot existant utilisé: %', v_time_slot_id;
    END IF;
    
    -- Vérifier si un match existe déjà
    SELECT id INTO v_match_id
    FROM matches
    WHERE group_id = test_group_id
      AND time_slot_id = v_time_slot_id
    LIMIT 1;
    
    IF v_match_id IS NULL THEN
      v_match_id := gen_random_uuid();
      INSERT INTO matches (id, group_id, time_slot_id, status, created_by, created_at)
      VALUES (v_match_id, test_group_id, v_time_slot_id, 'confirmed', sebbultel_id, NOW());
      RAISE NOTICE '  ✅ Match créé: %', v_match_id;
    ELSE
      UPDATE matches SET status = 'confirmed' WHERE id = v_match_id;
      RAISE NOTICE '  ✅ Match existant mis à jour: %', v_match_id;
    END IF;
    
    -- Supprimer les RSVPs existants pour ce match
    DELETE FROM match_rsvps WHERE match_id = v_match_id;
    
    -- Créer les 4 RSVPs avec status='accepted' (incluant sebbultel)
    INSERT INTO match_rsvps (match_id, user_id, status, created_at)
    VALUES
      (v_match_id, sebbultel_id, 'accepted', NOW()),
      (v_match_id, player1_id, 'accepted', NOW()),
      (v_match_id, player2_id, 'accepted', NOW()),
      (v_match_id, player3_id, 'accepted', NOW())
    ON CONFLICT (match_id, user_id) DO UPDATE SET
      status = 'accepted';
    
    RAISE NOTICE '  ✅ 4 RSVPs créés (sebbultel + 3 autres joueurs)';
  END LOOP;
  
  RAISE NOTICE '';
  RAISE NOTICE '✅ Tous les matchs ont été créés avec succès!';
  RAISE NOTICE '   - 3 matchs validés (status=confirmed)';
  RAISE NOTICE '   - sebbultel59@gmail.com inclus dans tous les matchs';
  
END $$;

-- Afficher les matchs créés avec leurs RSVPs
SELECT 
  m.id as match_id,
  m.status,
  m.created_at as match_created_at,
  ts.starts_at,
  ts.ends_at,
  COUNT(mr.user_id) as confirmed_players,
  ARRAY_AGG(p.display_name ORDER BY p.display_name) as player_names
FROM matches m
JOIN time_slots ts ON ts.id = m.time_slot_id
LEFT JOIN match_rsvps mr ON mr.match_id = m.id AND mr.status = 'accepted'
LEFT JOIN profiles p ON p.id = mr.user_id
WHERE m.group_id = (SELECT id FROM groups WHERE name ILIKE '%50+%membres%' OR name ILIKE '%test%50%' OR name = 'Groupe de test - 50+ membres' LIMIT 1)
  AND m.status = 'confirmed'
  AND ts.starts_at IN (
    '2025-12-23 15:00:00+00'::timestamptz,
    '2025-12-23 18:00:00+00'::timestamptz,
    '2025-12-24 10:00:00+00'::timestamptz
  )
GROUP BY m.id, m.status, m.created_at, ts.starts_at, ts.ends_at
ORDER BY ts.starts_at;

