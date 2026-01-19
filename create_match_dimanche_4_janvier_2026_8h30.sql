-- Script pour créer un match à confirmer le dimanche 4 janvier 2026 de 8h30 à 10h00
-- avec sebbultel59@gmail.com + eps.bultel + bultelseb59 + aristideDubreu

DO $$
DECLARE
  test_group_id UUID;
  sebbultel_id UUID;
  eps_bultel_id UUID;
  bultelseb59_id UUID;
  aristide_id UUID;
  v_time_slot_id UUID;
  v_match_id UUID;
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
  
  -- 3. Trouver eps.bultel (par display_name ou name)
  SELECT p.id INTO eps_bultel_id
  FROM profiles p
  JOIN group_members gm ON gm.user_id = p.id
  WHERE gm.group_id = test_group_id
    AND (p.display_name ILIKE '%eps.bultel%' OR p.name ILIKE '%eps.bultel%' OR p.email ILIKE '%eps.bultel%')
  LIMIT 1;
  
  IF eps_bultel_id IS NULL THEN
    RAISE EXCEPTION 'Utilisateur eps.bultel non trouvé dans le groupe';
  END IF;
  
  RAISE NOTICE '✅ Utilisateur trouvé: % (eps.bultel)', eps_bultel_id;
  
  -- 4. Trouver bultelseb59 (par display_name ou name)
  SELECT p.id INTO bultelseb59_id
  FROM profiles p
  JOIN group_members gm ON gm.user_id = p.id
  WHERE gm.group_id = test_group_id
    AND (p.display_name ILIKE '%bultelseb59%' OR p.name ILIKE '%bultelseb59%' OR p.email ILIKE '%bultelseb59%')
  LIMIT 1;
  
  IF bultelseb59_id IS NULL THEN
    RAISE EXCEPTION 'Utilisateur bultelseb59 non trouvé dans le groupe';
  END IF;
  
  RAISE NOTICE '✅ Utilisateur trouvé: % (bultelseb59)', bultelseb59_id;
  
  -- 5. Trouver aristideDubreu (par display_name ou name)
  SELECT p.id INTO aristide_id
  FROM profiles p
  JOIN group_members gm ON gm.user_id = p.id
  WHERE gm.group_id = test_group_id
    AND (p.display_name ILIKE '%aristideDubreu%' OR p.name ILIKE '%aristideDubreu%' OR p.email ILIKE '%aristideDubreu%' OR p.display_name ILIKE '%aristide%Dubreu%' OR p.name ILIKE '%aristide%Dubreu%')
  LIMIT 1;
  
  IF aristide_id IS NULL THEN
    RAISE EXCEPTION 'Utilisateur aristideDubreu non trouvé dans le groupe';
  END IF;
  
  RAISE NOTICE '✅ Utilisateur trouvé: % (aristideDubreu)', aristide_id;
  
  -- 6. Créer le match pour dimanche 4 janvier 2026 de 8h30 à 10h00
  match_date := '2026-01-04 08:30:00'::timestamptz;
  match_end := match_date + INTERVAL '1 hour 30 minutes';
  
  RAISE NOTICE '';
  RAISE NOTICE '📋 Création du match à confirmer pour le dimanche 4 janvier 2026 de 8h30 à 10h00...';
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
    -- Créer le match avec status='pending' (à confirmer)
    v_match_id := gen_random_uuid();
    INSERT INTO matches (id, group_id, time_slot_id, status, created_by, created_at)
    VALUES (v_match_id, test_group_id, v_time_slot_id, 'pending', sebbultel_id, NOW());
    RAISE NOTICE 'Match créé: %', v_match_id;
  ELSE
    -- Mettre à jour le match existant pour le mettre en pending
    UPDATE matches SET status = 'pending' WHERE id = v_match_id;
    RAISE NOTICE 'Match existant trouvé et mis à jour: %', v_match_id;
  END IF;
  
  -- Supprimer les RSVPs existants pour ce match (pour éviter les erreurs de trigger)
  DELETE FROM match_rsvps WHERE match_id = v_match_id;
  RAISE NOTICE 'RSVPs existants supprimés pour le match %', v_match_id;
  
  -- Créer 4 RSVPs acceptés (tous les joueurs)
  INSERT INTO match_rsvps (match_id, user_id, status, created_at)
  VALUES
    (v_match_id, sebbultel_id, 'accepted', NOW()),
    (v_match_id, eps_bultel_id, 'accepted', NOW()),
    (v_match_id, bultelseb59_id, 'accepted', NOW()),
    (v_match_id, aristide_id, 'accepted', NOW())
  ON CONFLICT (match_id, user_id) DO UPDATE SET
    status = 'accepted';
  
  RAISE NOTICE '✅ RSVPs créés pour les 4 joueurs - tous acceptés';
  RAISE NOTICE '';
  RAISE NOTICE '✅ Match à confirmer créé avec succès!';
  RAISE NOTICE '   - Match ID: %', v_match_id;
  RAISE NOTICE '   - Date: dimanche 4 janvier 2026 de 8h30 à 10h00';
  RAISE NOTICE '   - Status: pending (à confirmer)';
  RAISE NOTICE '   - Joueurs: sebbultel59@gmail.com + eps.bultel + bultelseb59 + aristideDubreu (tous acceptés)';
  
END $$;

-- Afficher le match créé avec les détails des joueurs
SELECT 
  'MATCH À CONFIRMER CRÉÉ' as type,
  m.id as match_id,
  m.status,
  ts.starts_at,
  ts.ends_at,
  COUNT(mr.user_id) FILTER (WHERE mr.status = 'accepted') as confirmed_players,
  ARRAY_AGG(p.display_name || ' (' || COALESCE(p.email, 'sans email') || ')' ORDER BY p.display_name) FILTER (WHERE mr.status = 'accepted') as player_names_with_email,
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
    AND ts2.starts_at = '2026-01-04 08:30:00'::timestamptz
  ORDER BY m2.created_at DESC
  LIMIT 1
)
GROUP BY m.id, m.status, ts.starts_at, ts.ends_at;










