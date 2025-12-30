-- Script pour créer 4 matches "en feu" dans le groupe "50+ test"
-- avec la possibilité de "me rendre disponible" pour sebbultel59@gmail.com
-- Un match en feu nécessite :
-- 1. Un match avec status='pending'
-- 2. Exactement 3 RSVPs avec status='accepted' (sans sebbultel59@gmail.com)
-- 3. sebbultel59@gmail.com ne doit pas avoir de RSVP pour ces matches

DO $$
DECLARE
  test_group_id UUID;
  sebbultel_id UUID;
  v_time_slot_id UUID;
  v_match_id UUID;
  -- Joueurs pour les matchs (3 joueurs différents par match)
  player1_id UUID;
  player2_id UUID;
  player3_id UUID;
  -- Variables pour les dates
  match_date TIMESTAMPTZ;
  match_end TIMESTAMPTZ;
  match_counter INTEGER;
  -- Heures différentes pour chaque match
  match_hours INTEGER[] := ARRAY[9, 11, 14, 16]; -- 9h, 11h, 14h, 16h
  match_hour INTEGER;
BEGIN
  -- 1. Trouver le groupe "50+ test"
  SELECT id INTO test_group_id
  FROM groups
  WHERE name ILIKE '%50+%test%' 
     OR name ILIKE '%test%50+%'
     OR name = 'Groupe de test - 50+ membres'
     OR name ILIKE '%50+ membres%'
  LIMIT 1;
  
  IF test_group_id IS NULL THEN
    RAISE EXCEPTION 'Groupe "50+ test" non trouvé';
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
  
  -- 3. Créer 4 matches en feu
  FOR match_counter IN 1..4 LOOP
    RAISE NOTICE '';
    RAISE NOTICE '=== Création du match en feu #% ===', match_counter;
    
    -- Date : demain + match_counter jours
    match_hour := match_hours[match_counter];
    match_date := (CURRENT_DATE + INTERVAL '1 day' + make_interval(days => match_counter - 1))::date + make_interval(hours => match_hour);
    match_end := match_date + INTERVAL '1 hour 30 minutes';
    
    RAISE NOTICE 'Date du match: % (de % à %)', match_date::date, match_date::time, match_end::time;
    
    -- Sélectionner 3 joueurs différents du groupe (hors sebbultel_id) qui ont un profil
    -- Utiliser JOIN avec profiles pour s'assurer que le profil existe
    SELECT gm.user_id INTO player1_id
    FROM group_members gm
    INNER JOIN profiles p ON p.id = gm.user_id
    WHERE gm.group_id = test_group_id
      AND gm.user_id != sebbultel_id
    ORDER BY gm.user_id
    LIMIT 1 OFFSET ((match_counter - 1) * 3);
    
    SELECT gm.user_id INTO player2_id
    FROM group_members gm
    INNER JOIN profiles p ON p.id = gm.user_id
    WHERE gm.group_id = test_group_id
      AND gm.user_id != sebbultel_id
      AND gm.user_id != COALESCE(player1_id, '00000000-0000-0000-0000-000000000000'::uuid)
    ORDER BY gm.user_id
    LIMIT 1 OFFSET ((match_counter - 1) * 3 + 1);
    
    SELECT gm.user_id INTO player3_id
    FROM group_members gm
    INNER JOIN profiles p ON p.id = gm.user_id
    WHERE gm.group_id = test_group_id
      AND gm.user_id != sebbultel_id
      AND gm.user_id != COALESCE(player1_id, '00000000-0000-0000-0000-000000000000'::uuid)
      AND gm.user_id != COALESCE(player2_id, '00000000-0000-0000-0000-000000000000'::uuid)
    ORDER BY gm.user_id
    LIMIT 1 OFFSET ((match_counter - 1) * 3 + 2);
    
    IF player1_id IS NULL OR player2_id IS NULL OR player3_id IS NULL THEN
      RAISE WARNING 'Pas assez de membres pour le match #% (minimum 3 requis, hors sebbultel)', match_counter;
      CONTINUE; -- Passer au match suivant
    END IF;
    
    RAISE NOTICE 'Joueurs sélectionnés: %, %, %', player1_id, player2_id, player3_id;
    
    -- 4. Créer ou récupérer un time_slot
    BEGIN
      SELECT id INTO v_time_slot_id
      FROM time_slots
      WHERE ABS(EXTRACT(EPOCH FROM (starts_at - match_date))) < 60
        AND ABS(EXTRACT(EPOCH FROM (ends_at - match_end))) < 60
        AND group_id = test_group_id
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
    
    -- 5. Vérifier si un match existe déjà pour ce créneau
    SELECT id INTO v_match_id
    FROM matches
    WHERE group_id = test_group_id
      AND time_slot_id = v_time_slot_id
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
    
    -- 7. Créer les 3 RSVPs avec status='accepted' (sans sebbultel_id)
    INSERT INTO match_rsvps (match_id, user_id, status, created_at)
    VALUES
      (v_match_id, player1_id, 'accepted', NOW()),
      (v_match_id, player2_id, 'accepted', NOW()),
      (v_match_id, player3_id, 'accepted', NOW())
    ON CONFLICT (match_id, user_id) DO UPDATE SET
      status = 'accepted';
    
    -- 8. Vérifier qu'il n'y a pas de RSVP pour sebbultel_id (important pour que le match soit "en feu")
    DELETE FROM match_rsvps 
    WHERE match_id = v_match_id 
      AND user_id = sebbultel_id;
    
    RAISE NOTICE '✅ Match "en feu" #% créé avec succès!', match_counter;
    RAISE NOTICE '   Match ID: %', v_match_id;
    RAISE NOTICE '   Date: %', match_date;
    RAISE NOTICE '   3 joueurs confirmés (sans sebbultel59@gmail.com)';
    
  END LOOP;
  
  RAISE NOTICE '';
  RAISE NOTICE '✅ 4 matches "en feu" créés avec succès!';
  RAISE NOTICE '   sebbultel59@gmail.com peut maintenant utiliser "Me rendre disponible" sur ces matches';
  
END $$;

-- Afficher les matches créés avec leurs RSVPs
SELECT 
  m.id as match_id,
  m.status,
  m.created_at as match_created_at,
  ts.starts_at,
  ts.ends_at,
  COUNT(mr.user_id) FILTER (WHERE mr.status = 'accepted') as confirmed_players,
  ARRAY_AGG(p.display_name ORDER BY p.display_name) FILTER (WHERE mr.status = 'accepted') as player_names,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM match_rsvps mr2 
      WHERE mr2.match_id = m.id 
      AND mr2.user_id = (SELECT id FROM auth.users WHERE email = 'sebbultel59@gmail.com' LIMIT 1)
    ) THEN '❌ sebbultel a un RSVP'
    ELSE '✅ sebbultel peut se rendre disponible'
  END as sebbultel_status
FROM matches m
JOIN time_slots ts ON ts.id = m.time_slot_id
LEFT JOIN match_rsvps mr ON mr.match_id = m.id AND mr.status = 'accepted'
LEFT JOIN profiles p ON p.id = mr.user_id
WHERE m.group_id = (
  SELECT id FROM groups 
  WHERE name ILIKE '%50+%test%' 
     OR name ILIKE '%test%50+%'
     OR name = 'Groupe de test - 50+ membres'
     OR name ILIKE '%50+ membres%'
  LIMIT 1
)
  AND m.status = 'pending'
  AND ts.starts_at > NOW()
GROUP BY m.id, m.status, m.created_at, ts.starts_at, ts.ends_at
HAVING COUNT(mr.user_id) FILTER (WHERE mr.status = 'accepted') = 3
ORDER BY ts.starts_at
LIMIT 10;

