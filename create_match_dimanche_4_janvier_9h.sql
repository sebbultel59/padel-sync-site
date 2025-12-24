-- Script pour créer un match validé le dimanche 4 janvier 2025 de 9h00 à 10h30
-- dans le groupe "50+ membres" avec sebbultel59@gmail.com et 3 autres joueurs ayant un numéro de téléphone

DO $$
DECLARE
  test_group_id UUID;
  sebbultel_id UUID;
  v_time_slot_id UUID;
  v_match_id UUID;
  -- Joueurs pour le match (sebbultel + 3 autres avec téléphone)
  player1_id UUID;
  player2_id UUID;
  player3_id UUID;
  -- Variables pour les dates
  match_date TIMESTAMPTZ;
  match_end TIMESTAMPTZ;
BEGIN
  -- 1. Trouver le groupe "50+ membres"
  SELECT id INTO test_group_id
  FROM groups
  WHERE name ILIKE '%50+%' OR name ILIKE '%test%50%' OR name ILIKE '%50+ membres%'
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
  
  -- 3. Récupérer 3 autres membres du groupe qui ont un numéro de téléphone (hors sebbultel_id)
  SELECT gm.user_id INTO player1_id
  FROM group_members gm
  JOIN profiles p ON p.id = gm.user_id
  WHERE gm.group_id = test_group_id
    AND gm.user_id != sebbultel_id
    AND p.phone IS NOT NULL
    AND p.phone != ''
  ORDER BY gm.user_id
  LIMIT 1 OFFSET 0;
  
  SELECT gm.user_id INTO player2_id
  FROM group_members gm
  JOIN profiles p ON p.id = gm.user_id
  WHERE gm.group_id = test_group_id
    AND gm.user_id != sebbultel_id
    AND gm.user_id != player1_id
    AND p.phone IS NOT NULL
    AND p.phone != ''
  ORDER BY gm.user_id
  LIMIT 1 OFFSET 0;
  
  SELECT gm.user_id INTO player3_id
  FROM group_members gm
  JOIN profiles p ON p.id = gm.user_id
  WHERE gm.group_id = test_group_id
    AND gm.user_id != sebbultel_id
    AND gm.user_id != player1_id
    AND gm.user_id != player2_id
    AND p.phone IS NOT NULL
    AND p.phone != ''
  ORDER BY gm.user_id
  LIMIT 1 OFFSET 0;
  
  IF player1_id IS NULL OR player2_id IS NULL OR player3_id IS NULL THEN
    RAISE EXCEPTION 'Pas assez de membres avec un numéro de téléphone dans le groupe (minimum 3 requis, en plus de sebbultel59@gmail.com)';
  END IF;
  
  RAISE NOTICE '✅ Joueurs sélectionnés: sebbultel (%), autres avec téléphone: %, %, %', sebbultel_id, player1_id, player2_id, player3_id;
  
  -- 4. Créer le match pour dimanche 4 janvier 2025 de 9h00 à 10h30
  match_date := '2025-01-04 09:00:00'::timestamptz;
  match_end := match_date + INTERVAL '1 hour 30 minutes';
  
  RAISE NOTICE '';
  RAISE NOTICE '📋 Création du match validé pour le dimanche 4 janvier 2025 de 9h00 à 10h30...';
  RAISE NOTICE 'Date: %', match_date;
  RAISE NOTICE 'Fin: %', match_end;
  
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
      RAISE NOTICE 'Time slot créé: %', v_time_slot_id;
    EXCEPTION WHEN undefined_column THEN
      INSERT INTO time_slots (id, starts_at, ends_at)
      VALUES (v_time_slot_id, match_date, match_end);
      RAISE NOTICE 'Time slot créé (sans group_id): %', v_time_slot_id;
    END;
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
    -- Créer le match avec status='confirmed' (validé)
    v_match_id := gen_random_uuid();
    INSERT INTO matches (id, group_id, time_slot_id, status, created_by, created_at)
    VALUES (v_match_id, test_group_id, v_time_slot_id, 'confirmed', sebbultel_id, NOW());
    RAISE NOTICE 'Match créé: %', v_match_id;
  ELSE
    -- Mettre à jour le match existant pour le valider
    UPDATE matches SET status = 'confirmed' WHERE id = v_match_id;
    RAISE NOTICE 'Match existant trouvé et mis à jour: %', v_match_id;
  END IF;
  
  -- Supprimer les RSVPs existants pour ce match (pour éviter les erreurs de trigger)
  DELETE FROM match_rsvps WHERE match_id = v_match_id;
  RAISE NOTICE 'RSVPs existants supprimés pour le match %', v_match_id;
  
  -- Créer 4 RSVPs acceptés (sebbultel + 3 autres joueurs) - tous avec status 'accepted' car match validé
  INSERT INTO match_rsvps (match_id, user_id, status, created_at)
  VALUES
    (v_match_id, sebbultel_id, 'accepted', NOW()),
    (v_match_id, player1_id, 'accepted', NOW()),
    (v_match_id, player2_id, 'accepted', NOW()),
    (v_match_id, player3_id, 'accepted', NOW())
  ON CONFLICT (match_id, user_id) DO UPDATE SET
    status = 'accepted';
  
  RAISE NOTICE '✅ RSVPs créés pour les 4 joueurs (sebbultel + 3 autres avec téléphone) - tous acceptés';
  RAISE NOTICE '';
  RAISE NOTICE '✅ Match validé créé avec succès!';
  RAISE NOTICE '   - Match ID: %', v_match_id;
  RAISE NOTICE '   - Date: dimanche 4 janvier 2025 de 9h00 à 10h30';
  RAISE NOTICE '   - Status: confirmed (validé)';
  RAISE NOTICE '   - Joueurs: sebbultel59@gmail.com + 3 autres avec téléphone (tous acceptés)';
  
END $$;

-- Afficher le match créé avec les détails des joueurs
SELECT 
  'MATCH VALIDÉ CRÉÉ' as type,
  m.id as match_id,
  m.status,
  ts.starts_at,
  ts.ends_at,
  COUNT(mr.user_id) FILTER (WHERE mr.status = 'accepted') as confirmed_players,
  ARRAY_AGG(p.display_name || ' (' || p.phone || ')' ORDER BY p.display_name) FILTER (WHERE mr.status = 'accepted') as player_names_with_phone,
  ARRAY_AGG(p.email ORDER BY p.display_name) FILTER (WHERE mr.status = 'accepted') as player_emails
FROM matches m
JOIN time_slots ts ON ts.id = m.time_slot_id
LEFT JOIN match_rsvps mr ON mr.match_id = m.id AND mr.status = 'accepted'
LEFT JOIN profiles p ON p.id = mr.user_id
WHERE m.id = (
  SELECT m2.id
  FROM matches m2
  JOIN time_slots ts2 ON ts2.id = m2.time_slot_id
  WHERE m2.group_id = (SELECT id FROM groups WHERE name ILIKE '%50+%' OR name ILIKE '%test%50%' OR name ILIKE '%50+ membres%' LIMIT 1)
    AND ts2.starts_at = '2025-01-04 09:00:00'::timestamptz
  ORDER BY m2.created_at DESC
  LIMIT 1
)
GROUP BY m.id, m.status, ts.starts_at, ts.ends_at;

