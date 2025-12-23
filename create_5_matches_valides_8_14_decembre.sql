-- Script pour créer 5 matchs validés dans le groupe "50+" avec sebbultel59@gmail.com parmi les joueurs
-- Status='confirmed' avec 4 joueurs confirmés (dont sebbultel)
-- Semaine du 8 au 14 décembre 2024

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
  -- Variables pour les dates
  match_date TIMESTAMPTZ;
  match_end TIMESTAMPTZ;
  match_counter INTEGER := 0;
  week_start_date DATE := '2024-12-08'; -- Dimanche 8 décembre
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
  
  -- 3. Récupérer une liste de membres du groupe (hors sebbultel_id) pour les autres joueurs
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
  -- CRÉER 5 MATCHS VALIDÉS (status='confirmed' avec 4 RSVPs acceptés)
  -- Semaine du 8 au 14 décembre
  -- ==========================================
  RAISE NOTICE '';
  RAISE NOTICE '📋 Création de 5 matchs validés (semaine du 8 au 14 décembre)...';
  
  FOR match_counter IN 1..5 LOOP
    -- Date : 8 décembre + (match_counter - 1) jours, à 18h00
    -- match_counter 1 = 8 déc, 2 = 9 déc, 3 = 10 déc, 4 = 11 déc, 5 = 12 déc
    match_date := (week_start_date + make_interval(days => match_counter - 1))::date + TIME '18:00:00';
    match_end := match_date + INTERVAL '1 hour 30 minutes';
    
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
    ELSE
      UPDATE matches SET status = 'confirmed' WHERE id = v_match_id;
    END IF;
    
    -- Supprimer les RSVPs existants
    DELETE FROM match_rsvps WHERE match_id = v_match_id;
    
    -- Créer 4 RSVPs acceptés (incluant sebbultel + 3 autres)
    INSERT INTO match_rsvps (match_id, user_id, status, created_at)
    VALUES
      (v_match_id, sebbultel_id, 'accepted', NOW()),
      (v_match_id, player1_id, 'accepted', NOW()),
      (v_match_id, player2_id, 'accepted', NOW()),
      (v_match_id, player3_id, 'accepted', NOW())
    ON CONFLICT (match_id, user_id) DO UPDATE SET
      status = 'accepted';
    
    RAISE NOTICE '  ✅ Match validé #% créé: % (date: %) - 4 joueurs confirmés (dont sebbultel)', match_counter, v_match_id, match_date;
  END LOOP;
  
  RAISE NOTICE '';
  RAISE NOTICE '✅ Tous les matchs ont été créés avec succès!';
  RAISE NOTICE '   - 5 matchs validés (status=confirmed, 4 joueurs confirmés)';
  RAISE NOTICE '   - Semaine du 8 au 14 décembre 2024';
  RAISE NOTICE '   - sebbultel59@gmail.com est inclus dans tous les matchs (confirmé)';
  
END $$;

-- Afficher les matchs validés créés (4 joueurs confirmés)
SELECT 
  'VALIDÉ' as type,
  m.id as match_id,
  m.status,
  ts.starts_at,
  ts.ends_at,
  COUNT(mr.user_id) FILTER (WHERE mr.status = 'accepted') as confirmed_players,
  ARRAY_AGG(p.display_name ORDER BY p.display_name) FILTER (WHERE mr.status = 'accepted') as player_names,
  BOOL_OR(p.id = (SELECT id FROM auth.users WHERE email = 'sebbultel59@gmail.com') AND mr.status = 'accepted') as sebbultel_confirmed
FROM matches m
JOIN time_slots ts ON ts.id = m.time_slot_id
LEFT JOIN match_rsvps mr ON mr.match_id = m.id AND mr.status = 'accepted'
LEFT JOIN profiles p ON p.id = mr.user_id
WHERE m.group_id = (SELECT id FROM groups WHERE name ILIKE '%50+%' OR name ILIKE '%test%50%' OR name = 'Groupe de test - 50+' LIMIT 1)
  AND m.status = 'confirmed'
  AND ts.starts_at >= '2024-12-08'::date
  AND ts.starts_at < '2024-12-15'::date
GROUP BY m.id, m.status, ts.starts_at, ts.ends_at
ORDER BY ts.starts_at
LIMIT 10;









