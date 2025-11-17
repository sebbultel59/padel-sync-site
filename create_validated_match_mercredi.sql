-- Commande SQL pour créer un match validé dans le groupe de test - 50+ membres
-- Un match validé nécessite :
-- 1. Un match avec status='confirmed'
-- 2. 4 RSVPs avec status='accepted' (4 joueurs confirmés)
-- Avec seb.sax.evenements@gmail.com pour mercredi à 17h30

DO $$
DECLARE
  test_group_id UUID;
  v_time_slot_id UUID;  -- Renommé pour éviter l'ambiguïté avec la colonne time_slot_id
  v_match_id UUID;  -- Renommé pour éviter l'ambiguïté avec la colonne match_id
  -- Sélectionner 4 joueurs du groupe de test
  player1_id UUID;
  player2_id UUID;
  player3_id UUID;
  player4_id UUID;
  -- Date du match : mercredi prochain à 17h30
  -- Calculer le prochain mercredi (jour 3 de la semaine ISO, où lundi=1)
  match_date TIMESTAMPTZ := (
    CASE 
      WHEN EXTRACT(DOW FROM CURRENT_DATE) = 0 THEN CURRENT_DATE + INTERVAL '3 days'  -- Si dimanche, mercredi dans 3 jours
      WHEN EXTRACT(DOW FROM CURRENT_DATE) = 1 THEN CURRENT_DATE + INTERVAL '2 days'   -- Si lundi, mercredi dans 2 jours
      WHEN EXTRACT(DOW FROM CURRENT_DATE) = 2 THEN CURRENT_DATE + INTERVAL '1 day'    -- Si mardi, mercredi demain
      WHEN EXTRACT(DOW FROM CURRENT_DATE) = 3 THEN CURRENT_DATE + INTERVAL '7 days'   -- Si mercredi, mercredi prochain (dans 7 jours)
      WHEN EXTRACT(DOW FROM CURRENT_DATE) = 4 THEN CURRENT_DATE + INTERVAL '6 days'  -- Si jeudi, mercredi dans 6 jours
      WHEN EXTRACT(DOW FROM CURRENT_DATE) = 5 THEN CURRENT_DATE + INTERVAL '5 days'  -- Si vendredi, mercredi dans 5 jours
      WHEN EXTRACT(DOW FROM CURRENT_DATE) = 6 THEN CURRENT_DATE + INTERVAL '4 days'  -- Si samedi, mercredi dans 4 jours
    END
  )::date + TIME '17:30:00';
  match_end TIMESTAMPTZ := match_date + INTERVAL '1 hour 30 minutes';
  v_time_slot_exists BOOLEAN;
BEGIN
  -- 1. Trouver le groupe de test
  SELECT id INTO test_group_id
  FROM groups
  WHERE name ILIKE '%test%50%membres%' OR name = 'test - 50+ membres' OR name = 'Groupe de test - 50+ membres'
  LIMIT 1;
  
  IF test_group_id IS NULL THEN
    RAISE EXCEPTION 'Groupe de test non trouvé. Exécutez d''abord la migration create_test_group_with_members.sql';
  END IF;
  
  RAISE NOTICE 'Groupe trouvé: %', test_group_id;
  
  -- 2. Sélectionner 4 joueurs du groupe, en incluant seb.sax.evenements@gmail.com
  -- D'abord, trouver l'utilisateur avec cet email
  SELECT id INTO player1_id
  FROM auth.users
  WHERE email = 'seb.sax.evenements@gmail.com'
  LIMIT 1;
  
  IF player1_id IS NULL THEN
    RAISE EXCEPTION 'Utilisateur seb.sax.evenements@gmail.com non trouvé';
  END IF;
  
  -- Vérifier que cet utilisateur est membre du groupe
  IF NOT EXISTS (SELECT 1 FROM group_members WHERE group_id = test_group_id AND user_id = player1_id) THEN
    RAISE EXCEPTION 'L''utilisateur seb.sax.evenements@gmail.com n''est pas membre du groupe';
  END IF;
  
  RAISE NOTICE 'Joueur 1 (seb.sax.evenements@gmail.com): %', player1_id;
  
  -- Sélectionner 3 autres joueurs du groupe (en excluant player1_id)
  SELECT user_id INTO player2_id
  FROM group_members
  WHERE group_id = test_group_id
    AND user_id != player1_id
  ORDER BY user_id
  LIMIT 1 OFFSET 0;
  
  SELECT user_id INTO player3_id
  FROM group_members
  WHERE group_id = test_group_id
    AND user_id != player1_id
    AND user_id != player2_id
  ORDER BY user_id
  LIMIT 1 OFFSET 0;
  
  SELECT user_id INTO player4_id
  FROM group_members
  WHERE group_id = test_group_id
    AND user_id != player1_id
    AND user_id != player2_id
    AND user_id != player3_id
  ORDER BY user_id
  LIMIT 1 OFFSET 0;
  
  IF player2_id IS NULL OR player3_id IS NULL OR player4_id IS NULL THEN
    RAISE EXCEPTION 'Pas assez de membres dans le groupe (minimum 4 requis, y compris seb.sax.evenements@gmail.com)';
  END IF;
  
  RAISE NOTICE 'Joueurs sélectionnés: %, %, %, %', player1_id, player2_id, player3_id, player4_id;
  
  -- 3. Créer ou récupérer un time_slot pour mercredi prochain à 17h30 (1h30)
  -- Rechercher un time_slot existant avec une tolérance de 1 minute pour les timestamps
  -- Essayer d'abord avec group_id si la colonne existe
  BEGIN
    SELECT id INTO v_time_slot_id
    FROM time_slots
    WHERE ABS(EXTRACT(EPOCH FROM (starts_at - match_date))) < 60
      AND ABS(EXTRACT(EPOCH FROM (ends_at - match_end))) < 60
      AND group_id = test_group_id
    LIMIT 1;
  EXCEPTION WHEN undefined_column THEN
    -- Si group_id n'existe pas, rechercher sans group_id
    SELECT id INTO v_time_slot_id
    FROM time_slots
    WHERE ABS(EXTRACT(EPOCH FROM (starts_at - match_date))) < 60
      AND ABS(EXTRACT(EPOCH FROM (ends_at - match_end))) < 60
    LIMIT 1;
  END;
  
  IF v_time_slot_id IS NULL THEN
    v_time_slot_id := gen_random_uuid();
    -- Créer le time_slot
    -- Essayer d'insérer avec group_id si la colonne existe, sinon sans
    BEGIN
      INSERT INTO time_slots (id, group_id, starts_at, ends_at)
      VALUES (v_time_slot_id, test_group_id, match_date, match_end);
      RAISE NOTICE 'Time slot créé avec group_id: %', v_time_slot_id;
    EXCEPTION WHEN undefined_column THEN
      -- Si group_id n'existe pas, créer sans group_id
      INSERT INTO time_slots (id, starts_at, ends_at)
      VALUES (v_time_slot_id, match_date, match_end);
      RAISE NOTICE 'Time slot créé sans group_id: %', v_time_slot_id;
    END;
    RAISE NOTICE '   starts_at: %', match_date;
    RAISE NOTICE '   ends_at: %', match_end;
  ELSE
    RAISE NOTICE 'Time slot existant utilisé: %', v_time_slot_id;
  END IF;
  
  -- Vérifier que le time_slot existe bien dans la base de données
  SELECT EXISTS(SELECT 1 FROM time_slots WHERE id = v_time_slot_id) INTO v_time_slot_exists;
  IF NOT v_time_slot_exists THEN
    RAISE EXCEPTION 'Le time_slot créé n''existe pas dans la base de données';
  END IF;
  RAISE NOTICE '✅ Time slot vérifié et existe: %', v_time_slot_id;
  
  -- 4. Vérifier si un match existe déjà pour ce group_id et time_slot_id
  SELECT id INTO v_match_id
  FROM matches
  WHERE matches.group_id = test_group_id
    AND matches.time_slot_id = v_time_slot_id
  LIMIT 1;
  
  IF v_match_id IS NULL THEN
    -- Créer un nouveau match avec status='confirmed'
    v_match_id := gen_random_uuid();
    INSERT INTO matches (id, group_id, time_slot_id, status, created_by, created_at)
    VALUES (v_match_id, test_group_id, v_time_slot_id, 'confirmed', player1_id, NOW());
    RAISE NOTICE 'Match créé: %', v_match_id;
  ELSE
    -- Mettre à jour le match existant pour le confirmer
    UPDATE matches
    SET status = 'confirmed'
    WHERE id = v_match_id;
    RAISE NOTICE 'Match existant trouvé et mis à jour: %', v_match_id;
  END IF;
  
  -- 5. Créer les 4 RSVPs avec status='accepted'
  INSERT INTO match_rsvps (match_id, user_id, status, created_at)
  VALUES
    (v_match_id, player1_id, 'accepted', NOW()),
    (v_match_id, player2_id, 'accepted', NOW()),
    (v_match_id, player3_id, 'accepted', NOW()),
    (v_match_id, player4_id, 'accepted', NOW())
  ON CONFLICT (match_id, user_id) DO UPDATE SET
    status = 'accepted';
  
  RAISE NOTICE '✅ Match validé créé avec succès!';
  RAISE NOTICE '   Match ID: %', v_match_id;
  RAISE NOTICE '   Date: %', match_date;
  RAISE NOTICE '   Groupe: %', test_group_id;
  RAISE NOTICE '   4 joueurs confirmés';
  
END $$;

-- Afficher le match créé avec ses RSVPs
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
WHERE m.group_id = (SELECT id FROM groups WHERE name ILIKE '%test%50%membres%' OR name = 'test - 50+ membres' OR name = 'Groupe de test - 50+ membres' LIMIT 1)
  AND m.status = 'confirmed'
  AND ts.starts_at >= CURRENT_DATE
GROUP BY m.id, m.status, m.created_at, ts.starts_at, ts.ends_at
ORDER BY ts.starts_at DESC
LIMIT 5;

