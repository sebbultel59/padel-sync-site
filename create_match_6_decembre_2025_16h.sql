-- Script pour créer un match validé le samedi 6 décembre 2025 à 16h
-- avec sebbultel59@gmail.com parmi les joueurs
-- Status='confirmed' avec 4 joueurs confirmés (dont sebbultel)

DO $$
DECLARE
  test_group_id UUID;
  sebbultel_id UUID;
  v_time_slot_id UUID;
  v_match_id UUID;
  -- Joueurs pour le match
  player1_id UUID;
  player2_id UUID;
  player3_id UUID;
  -- Variables pour les dates
  match_date TIMESTAMPTZ;
  match_end TIMESTAMPTZ;
  available_slot_found BOOLEAN;
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
  -- CRÉER 1 MATCH VALIDÉ (status='confirmed' avec 4 RSVPs acceptés)
  -- Samedi 6 décembre 2025 à 16h00
  -- ==========================================
  RAISE NOTICE '';
  RAISE NOTICE '📋 Création d''un match validé (samedi 6 décembre 2025 à 16h00)...';
  
  -- Date : samedi 6 décembre 2025 à 16h00
  match_date := '2025-12-06'::date + TIME '16:00:00';
  match_end := match_date + INTERVAL '1 hour 30 minutes';
  
  available_slot_found := false;
  
  -- Chercher un time_slot disponible (non occupé par un match)
  SELECT ts.id INTO v_time_slot_id
  FROM time_slots ts
  LEFT JOIN matches m ON m.time_slot_id = ts.id AND m.group_id = test_group_id
  WHERE ts.group_id = test_group_id
    AND ts.starts_at = match_date
    AND ts.ends_at = match_end
    AND m.id IS NULL  -- Pas de match existant sur ce time_slot
  LIMIT 1;
  
  IF v_time_slot_id IS NULL THEN
    -- Aucun time_slot disponible trouvé, en créer un nouveau
    v_time_slot_id := gen_random_uuid();
    BEGIN
      INSERT INTO time_slots (id, group_id, starts_at, ends_at)
      VALUES (v_time_slot_id, test_group_id, match_date, match_end);
      available_slot_found := true;
      RAISE NOTICE '  📅 Nouveau time_slot créé: % (dates: % -> %)', v_time_slot_id, match_date, match_end;
    EXCEPTION WHEN unique_violation THEN
      -- Si conflit (time_slot existe déjà avec ces dates), chercher un autre créneau
      RAISE NOTICE '  ⚠️ Conflit de time_slot, essai avec un créneau différent...';
      -- Essayer avec un créneau à 17h00 au lieu de 16h00
      match_date := '2025-12-06'::date + TIME '17:00:00';
      match_end := match_date + INTERVAL '1 hour 30 minutes';
      
      -- Vérifier si ce créneau est disponible
      SELECT ts.id INTO v_time_slot_id
      FROM time_slots ts
      LEFT JOIN matches m ON m.time_slot_id = ts.id AND m.group_id = test_group_id
      WHERE ts.group_id = test_group_id
        AND ts.starts_at = match_date
        AND ts.ends_at = match_end
        AND m.id IS NULL
      LIMIT 1;
      
      IF v_time_slot_id IS NULL THEN
        v_time_slot_id := gen_random_uuid();
        INSERT INTO time_slots (id, group_id, starts_at, ends_at)
        VALUES (v_time_slot_id, test_group_id, match_date, match_end);
        available_slot_found := true;
        RAISE NOTICE '  📅 Nouveau time_slot créé (17h00): % (dates: % -> %)', v_time_slot_id, match_date, match_end;
      END IF;
    END;
  ELSE
    available_slot_found := true;
    RAISE NOTICE '  📅 Time_slot disponible trouvé: % (dates: % -> %)', v_time_slot_id, match_date, match_end;
  END IF;
  
  IF NOT available_slot_found THEN
    RAISE EXCEPTION 'Impossible de trouver ou créer un time_slot disponible';
  END IF;
  
  -- Créer le match
  v_match_id := gen_random_uuid();
  INSERT INTO matches (id, group_id, time_slot_id, status, created_by, created_at)
  VALUES (v_match_id, test_group_id, v_time_slot_id, 'confirmed', sebbultel_id, NOW());
  
  -- Créer 4 RSVPs acceptés (incluant sebbultel + 3 autres)
  INSERT INTO match_rsvps (match_id, user_id, status, created_at)
  VALUES
    (v_match_id, sebbultel_id, 'accepted', NOW()),
    (v_match_id, player1_id, 'accepted', NOW()),
    (v_match_id, player2_id, 'accepted', NOW()),
    (v_match_id, player3_id, 'accepted', NOW())
  ON CONFLICT (match_id, user_id) DO UPDATE SET
    status = 'accepted';
  
  RAISE NOTICE '  ✅ Match validé créé: % (date: % à %) - 4 joueurs confirmés (dont sebbultel)', 
    v_match_id, match_date, match_end;
  
  RAISE NOTICE '';
  RAISE NOTICE '✅ Le match a été créé avec succès!';
  RAISE NOTICE '   - Match validé (status=confirmed, 4 joueurs confirmés)';
  RAISE NOTICE '   - Date: Samedi 6 décembre 2025 à 16h00';
  RAISE NOTICE '   - sebbultel59@gmail.com est inclus (confirmé)';
  
END $$;

-- Afficher le match créé
SELECT 
  'VALIDÉ' as type,
  m.id as match_id,
  m.status,
  ts.starts_at,
  ts.ends_at,
  COUNT(mr.user_id) FILTER (WHERE mr.status = 'accepted') as confirmed_players,
  ARRAY_AGG(p.display_name ORDER BY p.display_name) FILTER (WHERE mr.status = 'accepted') as player_names,
  BOOL_OR(p.id = (SELECT id FROM auth.users WHERE email = 'sebbultel59@gmail.com' LIMIT 1) AND mr.status = 'accepted') as sebbultel_confirmed
FROM matches m
JOIN time_slots ts ON ts.id = m.time_slot_id
LEFT JOIN match_rsvps mr ON mr.match_id = m.id AND mr.status = 'accepted'
LEFT JOIN profiles p ON p.id = mr.user_id
WHERE m.group_id = (SELECT id FROM groups WHERE name ILIKE '%50+%' OR name ILIKE '%test%50%' OR name = 'Groupe de test - 50+' LIMIT 1)
  AND m.status = 'confirmed'
  AND ts.starts_at >= '2025-12-06'::date
  AND ts.starts_at < '2025-12-07'::date
  AND ts.starts_at::time = '16:00:00'::time
  AND m.created_at > NOW() - INTERVAL '5 minutes'  -- Seulement le match créé récemment
GROUP BY m.id, m.status, ts.starts_at, ts.ends_at
ORDER BY ts.starts_at;









