-- Script SQL pour créer 4 matchs confirmés le vendredi 5 décembre 2025
-- avec sebbultel59@gmail.com parmi les 4 joueurs
-- Date: 2025-12-06

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
  v_hour INTEGER;
  hours INTEGER[] := ARRAY[18, 19, 20, 21]; -- 18h, 19h, 20h, 21h
BEGIN
  -- 1. Trouver le groupe de test avec 50+ membres
  SELECT id INTO test_group_id
  FROM groups
  WHERE name = 'Groupe de test - 50+ membres'
  LIMIT 1;
  
  IF test_group_id IS NULL THEN
    RAISE EXCEPTION 'Groupe "Groupe de test - 50+ membres" introuvable';
  END IF;
  
  RAISE NOTICE 'Groupe trouvé: %', test_group_id;
  
  -- 2. Trouver l'utilisateur sebbultel59@gmail.com
  SELECT p.id INTO sebbultel_id
  FROM profiles p
  INNER JOIN auth.users u ON u.id = p.id
  WHERE u.email = 'sebbultel59@gmail.com'
  LIMIT 1;
  
  IF sebbultel_id IS NULL THEN
    RAISE EXCEPTION 'Utilisateur sebbultel59@gmail.com introuvable';
  END IF;
  
  RAISE NOTICE 'Utilisateur sebbultel trouvé: %', sebbultel_id;
  
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
  
  RAISE NOTICE '3 autres joueurs trouvés: %', other_players;
  
  -- 4. Créer 4 matchs confirmés le vendredi 5 décembre 2025
  -- Date : vendredi 5 décembre 2025
  FOR match_counter IN 1..4 LOOP
    -- Heure : 18h, 19h, 20h, 21h
    v_hour := hours[match_counter];
    match_date := '2025-12-05'::date + make_interval(hours => v_hour);
    match_end := match_date + INTERVAL '1 hour 30 minutes';
    
    RAISE NOTICE '';
    RAISE NOTICE '=== Match % ===', match_counter;
    RAISE NOTICE 'Date: %', match_date;
    RAISE NOTICE 'Heure: %h00', v_hour;
    
    -- Créer ou récupérer un time_slot
    SELECT id INTO v_time_slot_id
    FROM time_slots
    WHERE ABS(EXTRACT(EPOCH FROM (starts_at - match_date))) < 60
      AND ABS(EXTRACT(EPOCH FROM (ends_at - match_end))) < 60
      AND (group_id = test_group_id OR group_id IS NULL)
    LIMIT 1;
    
    IF v_time_slot_id IS NULL THEN
      v_time_slot_id := gen_random_uuid();
      INSERT INTO time_slots (id, group_id, starts_at, ends_at)
      VALUES (v_time_slot_id, test_group_id, match_date, match_end);
      RAISE NOTICE 'Time slot créé: %', v_time_slot_id;
    ELSE
      RAISE NOTICE 'Time slot existant trouvé: %', v_time_slot_id;
    END IF;
    
    -- Vérifier si un match existe déjà pour ce group_id et time_slot_id
    SELECT id INTO v_match_id
    FROM matches
    WHERE group_id = test_group_id
      AND time_slot_id = v_time_slot_id
    LIMIT 1;

    IF v_match_id IS NULL THEN
      -- Créer le match avec status='confirmed'
      v_match_id := gen_random_uuid();
      INSERT INTO matches (id, group_id, time_slot_id, status, created_by, created_at)
      VALUES (v_match_id, test_group_id, v_time_slot_id, 'confirmed', sebbultel_id, match_date);
      RAISE NOTICE 'Match créé: %', v_match_id;
    ELSE
      -- Mettre à jour le match existant pour le confirmer
      UPDATE matches SET status = 'confirmed' WHERE id = v_match_id;
      RAISE NOTICE 'Match existant trouvé et mis à jour: %', v_match_id;
    END IF;
    
    -- Supprimer les RSVPs existants pour ce match (pour éviter les erreurs de trigger)
    DELETE FROM match_rsvps WHERE match_id = v_match_id;
    RAISE NOTICE 'RSVPs existants supprimés pour le match %', v_match_id;

    -- Assigner les joueurs : sebbultel + 3 autres
    -- Alterner la position de sebbultel dans les équipes
    IF match_counter % 2 = 0 THEN
      player1_id := sebbultel_id;
      player2_id := other_players[1];
      player3_id := other_players[2];
      player4_id := other_players[3];
    ELSE
      player1_id := other_players[1];
      player2_id := sebbultel_id;
      player3_id := other_players[2];
      player4_id := other_players[3];
    END IF;
    
    -- Créer les RSVPs avec status='accepted'
    INSERT INTO match_rsvps (match_id, user_id, status, created_at)
    VALUES
      (v_match_id, player1_id, 'accepted', match_date),
      (v_match_id, player2_id, 'accepted', match_date),
      (v_match_id, player3_id, 'accepted', match_date),
      (v_match_id, player4_id, 'accepted', match_date)
    ON CONFLICT (match_id, user_id) DO UPDATE SET
      status = 'accepted';
    
    RAISE NOTICE 'RSVPs créés pour 4 joueurs';
    RAISE NOTICE 'Équipe 1: % & %', player1_id, player2_id;
    RAISE NOTICE 'Équipe 2: % & %', player3_id, player4_id;
    RAISE NOTICE 'Status: confirmed (pas de résultat encore)';
  END LOOP;
  
  RAISE NOTICE '';
  RAISE NOTICE '✅ 4 matchs confirmés créés avec succès!';
  RAISE NOTICE 'Date: Vendredi 5 décembre 2025';
  RAISE NOTICE 'Heures: 18h00, 19h00, 20h00, 21h00';
  RAISE NOTICE 'Groupe: Groupe de test - 50+ membres';
  RAISE NOTICE 'Utilisateur: sebbultel59@gmail.com';
  RAISE NOTICE 'Tous les matchs ont le status="confirmed" (sans résultats)';
  RAISE NOTICE 'Vous pouvez maintenant saisir les résultats manuellement';
  
END $$;

-- Afficher les matchs créés (sans résultats)
SELECT 
  m.id as match_id,
  m.status as match_status,
  ts.starts_at as match_date,
  TO_CHAR(ts.starts_at, 'HH24:MI') as heure,
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
  AND ts.starts_at::date = '2025-12-05'::date
GROUP BY m.id, m.status, ts.starts_at
ORDER BY ts.starts_at ASC;

