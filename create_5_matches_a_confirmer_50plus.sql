-- Script pour créer 5 matchs à confirmer dans le groupe "50+" avec sebbultel59@gmail.com parmi les joueurs concernés
-- Status='pending' avec 3 joueurs confirmés + sebbultel invité (status='maybe', non confirmé)

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
  -- CRÉER 5 MATCHS À CONFIRMER (status='pending' avec 3 RSVPs acceptés, sebbultel non confirmé)
  -- ==========================================
  RAISE NOTICE '';
  RAISE NOTICE '📋 Création de 5 matchs à confirmer (sebbultel non confirmé)...';
  
  FOR match_counter IN 1..5 LOOP
    -- Date : demain + match_counter jours, à 18h00
    match_date := (CURRENT_DATE + INTERVAL '1 day' + make_interval(days => match_counter))::date + TIME '18:00:00';
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
      VALUES (v_match_id, test_group_id, v_time_slot_id, 'pending', player1_id, NOW());
    ELSE
      UPDATE matches SET status = 'pending' WHERE id = v_match_id;
    END IF;
    
    -- Supprimer les RSVPs existants
    DELETE FROM match_rsvps WHERE match_id = v_match_id;
    
    -- Créer 3 RSVPs acceptés (sans sebbultel - il n'a pas encore confirmé)
    INSERT INTO match_rsvps (match_id, user_id, status, created_at)
    VALUES
      (v_match_id, player1_id, 'accepted', NOW()),
      (v_match_id, player2_id, 'accepted', NOW()),
      (v_match_id, player3_id, 'accepted', NOW())
    ON CONFLICT (match_id, user_id) DO UPDATE SET
      status = 'accepted';
    
    -- Créer un RSVP maybe pour sebbultel (invité mais pas encore confirmé)
    INSERT INTO match_rsvps (match_id, user_id, status, created_at)
    VALUES
      (v_match_id, sebbultel_id, 'maybe', NOW())
    ON CONFLICT (match_id, user_id) DO UPDATE SET
      status = 'maybe';
    
    RAISE NOTICE '  ✅ Match à confirmer #% créé: % (date: %) - sebbultel invité (status=maybe, non confirmé)', match_counter, v_match_id, match_date;
  END LOOP;
  
  RAISE NOTICE '';
  RAISE NOTICE '✅ Tous les matchs ont été créés avec succès!';
  RAISE NOTICE '   - 5 matchs à confirmer (status=pending, 3 joueurs confirmés, sebbultel invité mais non confirmé)';
  RAISE NOTICE '   - sebbultel59@gmail.com est inclus dans tous les matchs (en attente de confirmation)';
  
END $$;

-- Afficher les matchs à confirmer créés (3 joueurs confirmés + sebbultel en attente)
SELECT 
  'À CONFIRMER' as type,
  m.id as match_id,
  m.status,
  ts.starts_at,
  ts.ends_at,
  COUNT(mr.user_id) FILTER (WHERE mr.status = 'accepted') as confirmed_players,
  COUNT(mr.user_id) FILTER (WHERE mr.status = 'maybe') as pending_players,
  ARRAY_AGG(p.display_name ORDER BY p.display_name) FILTER (WHERE mr.status = 'accepted') as confirmed_player_names,
  ARRAY_AGG(p.display_name ORDER BY p.display_name) FILTER (WHERE mr.status = 'maybe') as pending_player_names,
  BOOL_OR(p.id = (SELECT id FROM auth.users WHERE email = 'sebbultel59@gmail.com') AND mr.status = 'maybe') as sebbultel_pending
FROM matches m
JOIN time_slots ts ON ts.id = m.time_slot_id
LEFT JOIN match_rsvps mr ON mr.match_id = m.id AND mr.status IN ('accepted', 'maybe')
LEFT JOIN profiles p ON p.id = mr.user_id
WHERE m.group_id = (SELECT id FROM groups WHERE name ILIKE '%50+%' OR name ILIKE '%test%50%' OR name = 'Groupe de test - 50+' LIMIT 1)
  AND m.status = 'pending'
  AND ts.starts_at >= CURRENT_DATE
  AND (SELECT COUNT(*) FROM match_rsvps WHERE match_id = m.id AND status = 'accepted') = 3
  AND (SELECT COUNT(*) FROM match_rsvps WHERE match_id = m.id AND status = 'maybe') = 1
GROUP BY m.id, m.status, ts.starts_at, ts.ends_at
ORDER BY ts.starts_at
LIMIT 10;









