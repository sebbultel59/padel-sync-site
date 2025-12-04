-- Script SQL pour créer 4 matchs confirmés dans le groupe de test avec sebbultel59@gmail.com
-- Date: 2025-12-06
-- Note: Les matchs sont créés avec status='confirmed' mais sans résultats (match_results)

DO $$
DECLARE
  test_group_id UUID;
  sebbultel_id UUID;
  other_players UUID[];
  player1_id UUID;
  player2_id UUID;
  player3_id UUID;
  player4_id UUID;
  v_match_id UUID;
  v_time_slot_id UUID;
  match_date TIMESTAMPTZ;
  match_end TIMESTAMPTZ;
  match_counter INTEGER;
BEGIN
  -- 1. Trouver le groupe de test avec 50+ membres
  SELECT id INTO test_group_id
  FROM groups
  WHERE name = 'Groupe de test - 50+ membres'
  LIMIT 1;
  
  IF test_group_id IS NULL THEN
    RAISE EXCEPTION 'Groupe "Groupe de test - 50+ membres" introuvable';
  END IF;
  
  RAISE NOTICE '✅ Groupe trouvé: %', test_group_id;
  
  -- 2. Trouver l'utilisateur sebbultel59@gmail.com
  -- Dans Supabase, l'email est dans auth.users, mais on a besoin de l'id de profiles
  SELECT p.id INTO sebbultel_id
  FROM profiles p
  INNER JOIN auth.users u ON u.id = p.id
  WHERE u.email = 'sebbultel59@gmail.com'
  LIMIT 1;
  
  IF sebbultel_id IS NULL THEN
    RAISE EXCEPTION 'Utilisateur sebbultel59@gmail.com introuvable';
  END IF;
  
  RAISE NOTICE '✅ Utilisateur sebbultel trouvé: %', sebbultel_id;
  
  -- 3. Trouver 3 autres joueurs du groupe (différents de sebbultel)
  SELECT ARRAY_AGG(gm.user_id ORDER BY RANDOM())
  INTO other_players
  FROM group_members gm
  WHERE gm.group_id = test_group_id
    AND gm.user_id != sebbultel_id
  LIMIT 3;
  
  IF other_players IS NULL OR array_length(other_players, 1) < 3 THEN
    RAISE EXCEPTION 'Pas assez de joueurs dans le groupe (besoin de 3 autres joueurs en plus de sebbultel)';
  END IF;
  
  RAISE NOTICE '✅ 3 autres joueurs trouvés: %', other_players;
  
  -- 4. Créer 4 matchs confirmés (sans résultats)
  FOR match_counter IN 1..4 LOOP
    -- Date : aujourd'hui + match_counter jours, à 18h00 (futur pour pouvoir saisir les résultats)
    match_date := (CURRENT_DATE + make_interval(days => match_counter))::date + TIME '18:00:00';
    match_end := match_date + INTERVAL '1 hour 30 minutes';
    
    -- Vérifier si un match existe déjà pour cette date dans ce groupe
    SELECT m.id INTO v_match_id
    FROM matches m
    JOIN time_slots ts ON ts.id = m.time_slot_id
    WHERE m.group_id = test_group_id
      AND ABS(EXTRACT(EPOCH FROM (ts.starts_at - match_date))) < 60
      AND ABS(EXTRACT(EPOCH FROM (ts.ends_at - match_end))) < 60
    LIMIT 1;
    
    IF v_match_id IS NULL THEN
      -- Aucun match existant, créer un nouveau time_slot et un nouveau match
      v_time_slot_id := gen_random_uuid();
      INSERT INTO time_slots (id, group_id, starts_at, ends_at)
      VALUES (v_time_slot_id, test_group_id, match_date, match_end);
      
      v_match_id := gen_random_uuid();
      INSERT INTO matches (id, group_id, time_slot_id, status, created_by, created_at)
      VALUES (v_match_id, test_group_id, v_time_slot_id, 'confirmed', sebbultel_id, match_date);
      
      RAISE NOTICE '   Nouveau match créé';
    ELSE
      -- Match existant trouvé, récupérer son time_slot_id
      SELECT time_slot_id INTO v_time_slot_id
      FROM matches
      WHERE id = v_match_id;
      
      -- Mettre à jour le statut si nécessaire
      UPDATE matches
      SET status = 'confirmed'
      WHERE id = v_match_id AND status != 'confirmed';
      
      RAISE NOTICE '   Match existant réutilisé: %', v_match_id;
    END IF;
    
    -- Assigner les joueurs : sebbultel + 3 autres
    -- Mélanger l'ordre pour varier les équipes
    IF match_counter % 2 = 0 THEN
      -- Match pair : sebbultel avec le premier autre joueur
      player1_id := sebbultel_id;
      player2_id := other_players[1];
      player3_id := other_players[2];
      player4_id := other_players[3];
    ELSE
      -- Match impair : sebbultel avec le deuxième autre joueur
      player1_id := other_players[1];
      player2_id := sebbultel_id;
      player3_id := other_players[2];
      player4_id := other_players[3];
    END IF;
    
    -- Supprimer les RSVPs existants pour ce match (pour éviter le conflit avec le trigger)
    DELETE FROM match_rsvps WHERE match_id = v_match_id;
    
    -- Créer les RSVPs avec status='accepted'
    INSERT INTO match_rsvps (match_id, user_id, status, created_at)
    VALUES
      (v_match_id, player1_id, 'accepted', match_date),
      (v_match_id, player2_id, 'accepted', match_date),
      (v_match_id, player3_id, 'accepted', match_date),
      (v_match_id, player4_id, 'accepted', match_date);
    
    RAISE NOTICE '✅ Match % créé: %', match_counter, v_match_id;
    RAISE NOTICE '   Date: %', match_date;
    RAISE NOTICE '   Équipe 1: % & %', player1_id, player2_id;
    RAISE NOTICE '   Équipe 2: % & %', player3_id, player4_id;
    RAISE NOTICE '   Status: confirmed (pas de résultat encore)';
  END LOOP;
  
  RAISE NOTICE '';
  RAISE NOTICE '✅✅✅ 4 matchs confirmés créés avec succès! ✅✅✅';
  RAISE NOTICE '   Groupe: Groupe de test - 50+ membres';
  RAISE NOTICE '   Utilisateur: sebbultel59@gmail.com';
  RAISE NOTICE '   Tous les matchs ont le status="confirmed" (sans résultats)';
  RAISE NOTICE '   Vous pouvez maintenant saisir les résultats manuellement';
  
END $$;

-- Afficher les matchs créés (sans résultats)
SELECT 
  m.id as match_id,
  m.status as match_status,
  ts.starts_at as match_date,
  COUNT(mr.user_id) FILTER (WHERE mr.status = 'accepted') as confirmed_players,
  ARRAY_AGG(COALESCE(p.display_name, u.email) ORDER BY p.display_name) FILTER (WHERE mr.status = 'accepted') as player_names,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM match_rsvps mr2 
      WHERE mr2.match_id = m.id 
      AND mr2.user_id = (SELECT p.id FROM profiles p INNER JOIN auth.users u ON u.id = p.id WHERE u.email = 'sebbultel59@gmail.com' LIMIT 1)
      AND mr2.status = 'accepted'
    ) THEN 'Oui'
    ELSE 'Non'
  END as sebbultel_present
FROM matches m
JOIN time_slots ts ON ts.id = m.time_slot_id
LEFT JOIN match_rsvps mr ON mr.match_id = m.id AND mr.status = 'accepted'
LEFT JOIN profiles p ON p.id = mr.user_id
LEFT JOIN auth.users u ON u.id = p.id
WHERE m.group_id = (SELECT id FROM groups WHERE name = 'Groupe de test - 50+ membres' LIMIT 1)
  AND m.status = 'confirmed'
  AND m.created_by = (SELECT p.id FROM profiles p INNER JOIN auth.users u ON u.id = p.id WHERE u.email = 'sebbultel59@gmail.com' LIMIT 1)
  AND ts.starts_at >= CURRENT_DATE
GROUP BY m.id, m.status, ts.starts_at
ORDER BY ts.starts_at DESC
LIMIT 4;

