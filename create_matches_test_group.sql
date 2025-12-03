-- Script pour créer des disponibilités et des matchs dans "Groupe de test - 50+ membres"
-- Crée :
-- - Des disponibilités pour plusieurs membres
-- - Des matchs "possible" (2-3 joueurs disponibles, pas encore de match créé)
-- - Des matchs "RSVP" (status='pending' avec 4 joueurs confirmés)
-- - Des matchs "validé" (status='confirmed' avec 4 joueurs confirmés)

DO $$
DECLARE
  test_group_id UUID;
  v_time_slot_id UUID;
  v_match_id UUID;
  v_availability_id UUID;
  -- Joueurs pour les matchs
  player1_id UUID;
  player2_id UUID;
  player3_id UUID;
  player4_id UUID;
  player5_id UUID;
  player6_id UUID;
  -- Variables pour les dates
  slot_date DATE;
  slot_start TIMESTAMPTZ;
  slot_end TIMESTAMPTZ;
  match_counter INTEGER := 0;
  member_record RECORD;
  members_array UUID[];
  member_count INTEGER;
BEGIN
  -- 1. Trouver le groupe de test
  SELECT id INTO test_group_id
  FROM groups
  WHERE name ILIKE '%test%50%membres%' OR name ILIKE '%groupe de test%50%' OR name = 'Groupe de test - 50+ membres'
  LIMIT 1;
  
  IF test_group_id IS NULL THEN
    RAISE EXCEPTION 'Groupe "Groupe de test - 50+ membres" non trouvé';
  END IF;
  
  RAISE NOTICE '✅ Groupe trouvé: %', test_group_id;
  
  -- 2. Trouver l'utilisateur sebbultel59@gmail.com
  SELECT id INTO player1_id
  FROM auth.users
  WHERE email = 'sebbultel59@gmail.com'
  LIMIT 1;
  
  IF player1_id IS NULL THEN
    RAISE EXCEPTION 'Utilisateur sebbultel59@gmail.com non trouvé';
  END IF;
  
  -- Vérifier que cet utilisateur est membre du groupe
  IF NOT EXISTS (SELECT 1 FROM group_members WHERE group_id = test_group_id AND user_id = player1_id) THEN
    RAISE EXCEPTION 'L''utilisateur sebbultel59@gmail.com n''est pas membre du groupe';
  END IF;
  
  RAISE NOTICE '✅ Utilisateur sebbultel trouvé: % (sebbultel59@gmail.com)', player1_id;
  
  -- 3. Récupérer 5 autres membres du groupe (hors sebbultel) qui existent dans profiles
  SELECT ARRAY_AGG(sub.user_id) INTO members_array
  FROM (
    SELECT gm.user_id
    FROM group_members gm
    INNER JOIN profiles p ON p.id = gm.user_id
    WHERE gm.group_id = test_group_id
      AND gm.user_id != player1_id
    ORDER BY gm.user_id
    LIMIT 5
  ) sub;
  
  IF members_array IS NULL OR array_length(members_array, 1) < 3 THEN
    RAISE EXCEPTION 'Pas assez de membres valides dans le groupe (minimum 4 requis, y compris sebbultel59@gmail.com). Vérifiez que les membres ont des profils dans la table profiles.';
  END IF;
  
  -- Assigner les autres joueurs
  player2_id := members_array[1];
  player3_id := members_array[2];
  player4_id := members_array[3];
  player5_id := COALESCE(members_array[4], members_array[1]);
  player6_id := COALESCE(members_array[5], members_array[2]);
  
  RAISE NOTICE '✅ Joueurs sélectionnés: sebbultel (%), autres: %, %, %, %, %', 
    player1_id, player2_id, player3_id, player4_id, player5_id, player6_id;
  
  -- ==========================================
  -- CRÉER DES DISPONIBILITÉS
  -- ==========================================
  RAISE NOTICE '';
  RAISE NOTICE '📅 Création de disponibilités...';
  
  -- Créer des disponibilités pour les prochains jours
  FOR match_counter IN 1..10 LOOP
    slot_date := CURRENT_DATE + make_interval(days => match_counter);
    
    -- Créer des disponibilités pour différents créneaux
    -- Matin (10h-11h30)
    slot_start := slot_date + TIME '10:00:00';
    slot_end := slot_start + INTERVAL '1 hour 30 minutes';
    
    -- Disponibilité pour sebbultel (player1_id) et player2 (créneau "possible")
    -- Vérifier que les user_id existent dans profiles avant d'insérer
    IF EXISTS (SELECT 1 FROM profiles WHERE id = player1_id) THEN
      INSERT INTO availability_global (user_id, start, "end", status)
      VALUES (player1_id, slot_start, slot_end, 'available')
      ON CONFLICT (user_id, start, "end") DO NOTHING;
    END IF;
    
    IF EXISTS (SELECT 1 FROM profiles WHERE id = player2_id) THEN
      INSERT INTO availability_global (user_id, start, "end", status)
      VALUES (player2_id, slot_start, slot_end, 'available')
      ON CONFLICT (user_id, start, "end") DO NOTHING;
    END IF;
    
    -- Après-midi (14h-15h30) - sebbultel + 2 autres
    slot_start := slot_date + TIME '14:00:00';
    slot_end := slot_start + INTERVAL '1 hour 30 minutes';
    
    IF EXISTS (SELECT 1 FROM profiles WHERE id = player1_id) THEN
      INSERT INTO availability_global (user_id, start, "end", status)
      VALUES (player1_id, slot_start, slot_end, 'available')
      ON CONFLICT (user_id, start, "end") DO NOTHING;
    END IF;
    
    IF EXISTS (SELECT 1 FROM profiles WHERE id = player2_id) THEN
      INSERT INTO availability_global (user_id, start, "end", status)
      VALUES (player2_id, slot_start, slot_end, 'available')
      ON CONFLICT (user_id, start, "end") DO NOTHING;
    END IF;
    
    IF EXISTS (SELECT 1 FROM profiles WHERE id = player3_id) THEN
      INSERT INTO availability_global (user_id, start, "end", status)
      VALUES (player3_id, slot_start, slot_end, 'available')
      ON CONFLICT (user_id, start, "end") DO NOTHING;
    END IF;
    
    -- Soir (18h-19h30) - sebbultel + 5 autres pour les matchs RSVP et validés
    slot_start := slot_date + TIME '18:00:00';
    slot_end := slot_start + INTERVAL '1 hour 30 minutes';
    
    IF EXISTS (SELECT 1 FROM profiles WHERE id = player1_id) THEN
      INSERT INTO availability_global (user_id, start, "end", status)
      VALUES (player1_id, slot_start, slot_end, 'available')
      ON CONFLICT (user_id, start, "end") DO NOTHING;
    END IF;
    
    IF EXISTS (SELECT 1 FROM profiles WHERE id = player2_id) THEN
      INSERT INTO availability_global (user_id, start, "end", status)
      VALUES (player2_id, slot_start, slot_end, 'available')
      ON CONFLICT (user_id, start, "end") DO NOTHING;
    END IF;
    
    IF EXISTS (SELECT 1 FROM profiles WHERE id = player3_id) THEN
      INSERT INTO availability_global (user_id, start, "end", status)
      VALUES (player3_id, slot_start, slot_end, 'available')
      ON CONFLICT (user_id, start, "end") DO NOTHING;
    END IF;
    
    IF EXISTS (SELECT 1 FROM profiles WHERE id = player4_id) THEN
      INSERT INTO availability_global (user_id, start, "end", status)
      VALUES (player4_id, slot_start, slot_end, 'available')
      ON CONFLICT (user_id, start, "end") DO NOTHING;
    END IF;
    
    IF EXISTS (SELECT 1 FROM profiles WHERE id = player5_id) THEN
      INSERT INTO availability_global (user_id, start, "end", status)
      VALUES (player5_id, slot_start, slot_end, 'available')
      ON CONFLICT (user_id, start, "end") DO NOTHING;
    END IF;
    
    IF EXISTS (SELECT 1 FROM profiles WHERE id = player6_id) THEN
      INSERT INTO availability_global (user_id, start, "end", status)
      VALUES (player6_id, slot_start, slot_end, 'available')
      ON CONFLICT (user_id, start, "end") DO NOTHING;
    END IF;
  END LOOP;
  
  RAISE NOTICE '✅ Disponibilités créées';
  
  -- ==========================================
  -- CRÉER DES MATCHS "POSSIBLE" (2-3 joueurs disponibles, pas de match créé)
  -- ==========================================
  RAISE NOTICE '';
  RAISE NOTICE '🔥 Création de matchs "possible" (2-3 joueurs disponibles)...';
  
  -- Match possible 1 : 2 joueurs disponibles (demain matin)
  slot_date := CURRENT_DATE + INTERVAL '1 day';
  slot_start := slot_date + TIME '10:00:00';
  slot_end := slot_start + INTERVAL '1 hour 30 minutes';
  
  -- Pas de match créé, juste des disponibilités (déjà créées ci-dessus)
  RAISE NOTICE '  ✅ Match possible #1: 2 joueurs disponibles le % à 10h00', slot_date;
  
  -- Match possible 2 : 3 joueurs disponibles (demain après-midi)
  slot_start := slot_date + TIME '14:00:00';
  slot_end := slot_start + INTERVAL '1 hour 30 minutes';
  
  RAISE NOTICE '  ✅ Match possible #2: 3 joueurs disponibles le % à 14h00', slot_date;
  
  -- ==========================================
  -- CRÉER DES MATCHS RSVP (status='pending' avec 4 joueurs confirmés)
  -- ==========================================
  RAISE NOTICE '';
  RAISE NOTICE '📋 Création de matchs RSVP (4 joueurs confirmés)...';
  
  FOR match_counter IN 1..3 LOOP
    slot_date := CURRENT_DATE + INTERVAL '1 day' + make_interval(days => match_counter);
    slot_start := slot_date + TIME '18:00:00';
    slot_end := slot_start + INTERVAL '1 hour 30 minutes';
    
    -- Créer ou récupérer un time_slot
    SELECT id INTO v_time_slot_id
    FROM time_slots
    WHERE ABS(EXTRACT(EPOCH FROM (starts_at - slot_start))) < 60
      AND ABS(EXTRACT(EPOCH FROM (ends_at - slot_end))) < 60
      AND (group_id = test_group_id OR group_id IS NULL)
    LIMIT 1;
    
    IF v_time_slot_id IS NULL THEN
      v_time_slot_id := gen_random_uuid();
      BEGIN
        INSERT INTO time_slots (id, group_id, starts_at, ends_at)
        VALUES (v_time_slot_id, test_group_id, slot_start, slot_end);
      EXCEPTION WHEN undefined_column THEN
        INSERT INTO time_slots (id, starts_at, ends_at)
        VALUES (v_time_slot_id, slot_start, slot_end);
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
      VALUES (v_match_id, test_group_id, v_time_slot_id, 'pending', player1_id, NOW());
    ELSE
      UPDATE matches SET status = 'pending' WHERE id = v_match_id;
    END IF;
    
    -- Supprimer les RSVPs existants
    DELETE FROM match_rsvps WHERE match_id = v_match_id;
    
    -- Créer 4 RSVPs acceptés (incluant sebbultel + 3 autres)
    INSERT INTO match_rsvps (match_id, user_id, status, created_at)
    VALUES
      (v_match_id, player1_id, 'accepted', NOW()),  -- sebbultel
      (v_match_id, player2_id, 'accepted', NOW()),
      (v_match_id, player3_id, 'accepted', NOW()),
      (v_match_id, player4_id, 'accepted', NOW())
    ON CONFLICT (match_id, user_id) DO UPDATE SET
      status = 'accepted';
    
    RAISE NOTICE '  ✅ Match RSVP #% créé: % (date: %), sebbultel inclus', match_counter, v_match_id, slot_date;
  END LOOP;
  
  -- ==========================================
  -- CRÉER DES MATCHS VALIDÉS (status='confirmed' avec 4 joueurs confirmés)
  -- ==========================================
  RAISE NOTICE '';
  RAISE NOTICE '✅ Création de matchs validés (4 joueurs confirmés)...';
  
  FOR match_counter IN 1..3 LOOP
    slot_date := CURRENT_DATE + INTERVAL '1 day' + make_interval(days => match_counter + 3);
    slot_start := slot_date + TIME '18:00:00';
    slot_end := slot_start + INTERVAL '1 hour 30 minutes';
    
    -- Créer ou récupérer un time_slot
    SELECT id INTO v_time_slot_id
    FROM time_slots
    WHERE ABS(EXTRACT(EPOCH FROM (starts_at - slot_start))) < 60
      AND ABS(EXTRACT(EPOCH FROM (ends_at - slot_end))) < 60
      AND (group_id = test_group_id OR group_id IS NULL)
    LIMIT 1;
    
    IF v_time_slot_id IS NULL THEN
      v_time_slot_id := gen_random_uuid();
      BEGIN
        INSERT INTO time_slots (id, group_id, starts_at, ends_at)
        VALUES (v_time_slot_id, test_group_id, slot_start, slot_end);
      EXCEPTION WHEN undefined_column THEN
        INSERT INTO time_slots (id, starts_at, ends_at)
        VALUES (v_time_slot_id, slot_start, slot_end);
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
      VALUES (v_match_id, test_group_id, v_time_slot_id, 'confirmed', player1_id, NOW());
    ELSE
      UPDATE matches SET status = 'confirmed' WHERE id = v_match_id;
    END IF;
    
    -- Supprimer les RSVPs existants
    DELETE FROM match_rsvps WHERE match_id = v_match_id;
    
    -- Créer 4 RSVPs acceptés (incluant sebbultel + 3 autres)
    INSERT INTO match_rsvps (match_id, user_id, status, created_at)
    VALUES
      (v_match_id, player1_id, 'accepted', NOW()),  -- sebbultel
      (v_match_id, player2_id, 'accepted', NOW()),
      (v_match_id, player3_id, 'accepted', NOW()),
      (v_match_id, player4_id, 'accepted', NOW())
    ON CONFLICT (match_id, user_id) DO UPDATE SET
      status = 'accepted';
    
    RAISE NOTICE '  ✅ Match validé #% créé: % (date: %), sebbultel inclus', match_counter, v_match_id, slot_date;
  END LOOP;
  
  RAISE NOTICE '';
  RAISE NOTICE '✅ Tous les matchs ont été créés avec succès!';
  RAISE NOTICE '   - 2 matchs "possible" (2-3 joueurs disponibles, sebbultel inclus, pas de match créé)';
  RAISE NOTICE '   - 3 matchs RSVP (status=pending, 4 joueurs confirmés, sebbultel inclus)';
  RAISE NOTICE '   - 3 matchs validés (status=confirmed, 4 joueurs confirmés, sebbultel inclus)';
  RAISE NOTICE '   - sebbultel59@gmail.com est inclus dans tous les matchs';
  
END $$;

-- Afficher un résumé des matchs créés
SELECT 
  CASE 
    WHEN m.status = 'confirmed' THEN 'Validé'
    WHEN m.status = 'pending' AND COUNT(mr.user_id) FILTER (WHERE mr.status = 'accepted') = 4 THEN 'RSVP'
    ELSE 'Autre'
  END as type_match,
  m.id as match_id,
  m.status,
  ts.starts_at,
  COUNT(mr.user_id) FILTER (WHERE mr.status = 'accepted') as joueurs_confirmes,
  ARRAY_AGG(p.display_name ORDER BY p.display_name) FILTER (WHERE mr.status = 'accepted') as noms_joueurs
FROM matches m
JOIN time_slots ts ON ts.id = m.time_slot_id
LEFT JOIN match_rsvps mr ON mr.match_id = m.id AND mr.status = 'accepted'
LEFT JOIN profiles p ON p.id = mr.user_id
WHERE m.group_id = (SELECT id FROM groups WHERE name ILIKE '%test%50%membres%' OR name ILIKE '%groupe de test%50%' LIMIT 1)
  AND ts.starts_at >= CURRENT_DATE
GROUP BY m.id, m.status, ts.starts_at
ORDER BY ts.starts_at;

