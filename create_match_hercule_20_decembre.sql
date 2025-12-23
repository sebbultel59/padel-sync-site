-- Script pour créer un match dans le groupe "Hercule" avec sebbultel59@gmail.com + 3 joueurs aléatoires
-- Créneau : samedi 20 décembre 2025 de 10h00 à 11h30
-- Status='confirmed' avec 4 RSVPs acceptés

DO $$
DECLARE
  hercule_group_id UUID;
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
  -- 1. Trouver le groupe "Hercule"
  SELECT id INTO hercule_group_id
  FROM groups
  WHERE name ILIKE '%hercule%'
  LIMIT 1;
  
  IF hercule_group_id IS NULL THEN
    RAISE EXCEPTION 'Groupe "Hercule" non trouvé';
  END IF;
  
  RAISE NOTICE '✅ Groupe trouvé: %', hercule_group_id;
  
  -- 2. Trouver l'utilisateur sebbultel59@gmail.com
  SELECT id INTO sebbultel_id
  FROM auth.users
  WHERE email = 'sebbultel59@gmail.com'
  LIMIT 1;
  
  IF sebbultel_id IS NULL THEN
    RAISE EXCEPTION 'Utilisateur sebbultel59@gmail.com non trouvé';
  END IF;
  
  -- Vérifier que cet utilisateur est membre du groupe
  IF NOT EXISTS (SELECT 1 FROM group_members WHERE group_id = hercule_group_id AND user_id = sebbultel_id) THEN
    RAISE EXCEPTION 'L''utilisateur sebbultel59@gmail.com n''est pas membre du groupe Hercule';
  END IF;
  
  RAISE NOTICE '✅ Utilisateur trouvé: % (sebbultel59@gmail.com)', sebbultel_id;
  
  -- 3. Sélectionner 3 joueurs aléatoires du groupe (en excluant sebbultel_id)
  SELECT user_id INTO player1_id
  FROM group_members
  WHERE group_id = hercule_group_id
    AND user_id != sebbultel_id
  ORDER BY RANDOM()
  LIMIT 1;
  
  SELECT user_id INTO player2_id
  FROM group_members
  WHERE group_id = hercule_group_id
    AND user_id != sebbultel_id
    AND user_id != player1_id
  ORDER BY RANDOM()
  LIMIT 1;
  
  SELECT user_id INTO player3_id
  FROM group_members
  WHERE group_id = hercule_group_id
    AND user_id != sebbultel_id
    AND user_id != player1_id
    AND user_id != player2_id
  ORDER BY RANDOM()
  LIMIT 1;
  
  IF player1_id IS NULL OR player2_id IS NULL OR player3_id IS NULL THEN
    RAISE EXCEPTION 'Pas assez de membres dans le groupe Hercule (minimum 4 requis, y compris sebbultel59@gmail.com)';
  END IF;
  
  RAISE NOTICE '✅ Joueurs sélectionnés: sebbultel (%), autres: %, %, %', sebbultel_id, player1_id, player2_id, player3_id;
  
  -- 4. Créer ou récupérer un time_slot pour samedi 20 décembre 2025 de 10h00 à 11h30
  match_date := '2025-12-20'::date + TIME '10:00:00';
  match_end := match_date + INTERVAL '1 hour 30 minutes';
  
  available_slot_found := false;
  
  -- Chercher un time_slot existant pour ce créneau
  SELECT ts.id INTO v_time_slot_id
  FROM time_slots ts
  WHERE ts.group_id = hercule_group_id
    AND ts.starts_at = match_date
    AND ts.ends_at = match_end
  LIMIT 1;
  
  -- Si aucun time_slot n'existe, en créer un nouveau
  IF v_time_slot_id IS NULL THEN
    v_time_slot_id := gen_random_uuid();
    INSERT INTO time_slots (id, group_id, starts_at, ends_at)
    VALUES (v_time_slot_id, hercule_group_id, match_date, match_end);
    RAISE NOTICE '✅ Time_slot créé: %', v_time_slot_id;
  ELSE
    RAISE NOTICE '✅ Time_slot existant réutilisé: %', v_time_slot_id;
  END IF;
  
  -- 5. Créer le match
  v_match_id := gen_random_uuid();
  INSERT INTO matches (id, group_id, time_slot_id, status, created_at, created_by)
  VALUES (v_match_id, hercule_group_id, v_time_slot_id, 'confirmed', NOW(), sebbultel_id);
  
  RAISE NOTICE '✅ Match créé: %', v_match_id;
  
  -- 6. Créer les RSVPs pour les 4 joueurs (tous avec status='accepted')
  INSERT INTO match_rsvps (match_id, user_id, status, created_at)
  VALUES 
    (v_match_id, sebbultel_id, 'accepted', NOW()),
    (v_match_id, player1_id, 'accepted', NOW()),
    (v_match_id, player2_id, 'accepted', NOW()),
    (v_match_id, player3_id, 'accepted', NOW())
  ON CONFLICT (match_id, user_id) DO UPDATE SET status = 'accepted';
  
  RAISE NOTICE '✅ RSVPs créés pour les 4 joueurs';
  RAISE NOTICE '';
  RAISE NOTICE '🎉 Match créé avec succès!';
  RAISE NOTICE '   Match ID: %', v_match_id;
  RAISE NOTICE '   Groupe: Hercule (%)', hercule_group_id;
  RAISE NOTICE '   Date: Samedi 20 décembre 2025 de 10h00 à 11h30';
  RAISE NOTICE '   Joueurs: sebbultel59@gmail.com (%), %, %, %', sebbultel_id, player1_id, player2_id, player3_id;
  
END;
$$;

