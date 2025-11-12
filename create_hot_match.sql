-- Commande SQL pour créer un match "en feu" dans le groupe de test - 50+ membres
-- Un match en feu nécessite :
-- 1. Un match avec status='pending' ou 'open'
-- 2. 3 RSVPs avec status='accepted' (3 joueurs confirmés, sans l'utilisateur actuel)

DO $$
DECLARE
  test_group_id UUID;
  v_time_slot_id UUID;
  v_match_id UUID;
  -- Sélectionner 3 joueurs du groupe de test (pas l'utilisateur actuel)
  player1_id UUID;
  player2_id UUID;
  player3_id UUID;
  current_user_id UUID;
  -- Date du match : demain à 19h00 (1h30)
  match_date TIMESTAMPTZ := (CURRENT_DATE + INTERVAL '1 day')::date + TIME '19:00:00';
  match_end TIMESTAMPTZ := match_date + INTERVAL '1 hour 30 minutes';
  v_time_slot_exists BOOLEAN;
BEGIN
  -- 1. Récupérer l'ID de l'utilisateur actuel (si disponible via auth.uid())
  -- Note: Si exécuté depuis le dashboard Supabase, auth.uid() peut être NULL
  -- Dans ce cas, on sélectionnera 3 joueurs aléatoires
  BEGIN
    current_user_id := auth.uid();
  EXCEPTION WHEN OTHERS THEN
    current_user_id := NULL;
  END;
  
  RAISE NOTICE 'Utilisateur actuel: %', current_user_id;
  
  -- 2. Trouver le groupe de test
  SELECT id INTO test_group_id
  FROM groups
  WHERE name = 'Groupe de test - 50+ membres'
  LIMIT 1;
  
  IF test_group_id IS NULL THEN
    RAISE EXCEPTION 'Groupe de test non trouvé. Exécutez d''abord la migration create_test_group_with_members.sql';
  END IF;
  
  RAISE NOTICE 'Groupe trouvé: %', test_group_id;
  
  -- 3. Sélectionner 3 joueurs du groupe (en excluant l'utilisateur actuel si disponible)
  IF current_user_id IS NOT NULL THEN
    -- Exclure l'utilisateur actuel
    SELECT user_id INTO player1_id
    FROM group_members
    WHERE group_id = test_group_id
      AND user_id != current_user_id
    ORDER BY user_id
    LIMIT 1 OFFSET 0;
    
    SELECT user_id INTO player2_id
    FROM group_members
    WHERE group_id = test_group_id
      AND user_id != current_user_id
    ORDER BY user_id
    LIMIT 1 OFFSET 1;
    
    SELECT user_id INTO player3_id
    FROM group_members
    WHERE group_id = test_group_id
      AND user_id != current_user_id
    ORDER BY user_id
    LIMIT 1 OFFSET 2;
  ELSE
    -- Si pas d'utilisateur actuel, prendre les 3 premiers
    SELECT user_id INTO player1_id
    FROM group_members
    WHERE group_id = test_group_id
    ORDER BY user_id
    LIMIT 1 OFFSET 0;
    
    SELECT user_id INTO player2_id
    FROM group_members
    WHERE group_id = test_group_id
    ORDER BY user_id
    LIMIT 1 OFFSET 1;
    
    SELECT user_id INTO player3_id
    FROM group_members
    WHERE group_id = test_group_id
    ORDER BY user_id
    LIMIT 1 OFFSET 2;
  END IF;
  
  IF player1_id IS NULL OR player2_id IS NULL OR player3_id IS NULL THEN
    RAISE EXCEPTION 'Pas assez de membres dans le groupe (minimum 3 requis, hors utilisateur actuel)';
  END IF;
  
  RAISE NOTICE 'Joueurs sélectionnés: %, %, %', player1_id, player2_id, player3_id;
  
  -- 4. Créer ou récupérer un time_slot pour demain à 19h00 (1h30)
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
  
  -- 5. Vérifier si un match existe déjà pour ce group_id et time_slot_id
  SELECT id INTO v_match_id
  FROM matches
  WHERE matches.group_id = test_group_id
    AND matches.time_slot_id = v_time_slot_id
  LIMIT 1;
  
  IF v_match_id IS NULL THEN
    -- Créer un nouveau match avec status='pending' (pour qu'il soit visible comme match en feu)
    v_match_id := gen_random_uuid();
    INSERT INTO matches (id, group_id, time_slot_id, status, created_by, created_at)
    VALUES (v_match_id, test_group_id, v_time_slot_id, 'pending', player1_id, NOW());
    RAISE NOTICE 'Match créé: %', v_match_id;
  ELSE
    -- Mettre à jour le match existant
    UPDATE matches
    SET status = 'pending'
    WHERE id = v_match_id;
    RAISE NOTICE 'Match existant trouvé et mis à jour: %', v_match_id;
  END IF;
  
  -- 6. Supprimer les RSVPs existants pour ce match (pour repartir à zéro)
  DELETE FROM match_rsvps WHERE match_id = v_match_id;
  
  -- 7. Créer les 3 RSVPs avec status='accepted' (sans l'utilisateur actuel)
  INSERT INTO match_rsvps (match_id, user_id, status, created_at)
  VALUES
    (v_match_id, player1_id, 'accepted', NOW()),
    (v_match_id, player2_id, 'accepted', NOW()),
    (v_match_id, player3_id, 'accepted', NOW())
  ON CONFLICT (match_id, user_id) DO UPDATE SET
    status = 'accepted';
  
  RAISE NOTICE '✅ Match "en feu" créé avec succès!';
  RAISE NOTICE '   Match ID: %', v_match_id;
  RAISE NOTICE '   Date: %', match_date;
  RAISE NOTICE '   Groupe: %', test_group_id;
  RAISE NOTICE '   3 joueurs confirmés (sans vous)';
  RAISE NOTICE '   Vous pouvez maintenant tester le bouton "Me rendre disponible"';
  
END $$;

-- Afficher le match créé avec ses RSVPs
SELECT 
  m.id as match_id,
  m.status,
  m.created_at as match_created_at,
  ts.starts_at,
  ts.ends_at,
  COUNT(mr.user_id) FILTER (WHERE mr.status = 'accepted') as confirmed_players,
  ARRAY_AGG(p.display_name ORDER BY p.display_name) FILTER (WHERE mr.status = 'accepted') as player_names
FROM matches m
JOIN time_slots ts ON ts.id = m.time_slot_id
LEFT JOIN match_rsvps mr ON mr.match_id = m.id AND mr.status = 'accepted'
LEFT JOIN profiles p ON p.id = mr.user_id
WHERE m.group_id = (SELECT id FROM groups WHERE name = 'Groupe de test - 50+ membres' LIMIT 1)
  AND m.status = 'pending'
  AND ts.starts_at >= CURRENT_DATE
GROUP BY m.id, m.status, m.created_at, ts.starts_at, ts.ends_at
ORDER BY ts.starts_at DESC
LIMIT 5;
