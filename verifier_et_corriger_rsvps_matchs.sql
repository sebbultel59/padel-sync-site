-- Script pour vérifier et corriger les RSVPs des matchs confirmés
-- S'assure que sebbultel59@gmail.com est bien dans les RSVPs acceptés

DO $$
DECLARE
  test_group_id UUID := '9ad6a176-1935-416e-9ab3-ddba4d76434a';
  sebbultel_id UUID;
  match_ids UUID[] := ARRAY[
    '2eac7d78-fddc-4752-afff-e71434a41466',
    'fe3e482a-03a3-4975-a2e3-b5775dbd5117',
    '9fb7bcbc-5ba7-4981-849d-5a43c1216de8',
    '9b18fcdb-ac0b-47a6-8348-115e961600ab',
    '9fa0a68b-406e-4031-afa3-baad7bac7c1f'
  ];
  player1_id UUID;
  player2_id UUID;
  player3_id UUID;
  current_match_id UUID;
  rsvp_count INTEGER;
BEGIN
  -- 1. Trouver sebbultel59@gmail.com
  SELECT id INTO sebbultel_id
  FROM auth.users
  WHERE email = 'sebbultel59@gmail.com'
  LIMIT 1;
  
  IF sebbultel_id IS NULL THEN
    RAISE EXCEPTION 'Utilisateur sebbultel59@gmail.com non trouvé';
  END IF;
  
  RAISE NOTICE '✅ Utilisateur sebbultel trouvé: %', sebbultel_id;
  
  -- 2. Récupérer 3 autres membres du groupe
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
    RAISE EXCEPTION 'Pas assez de membres dans le groupe';
  END IF;
  
  RAISE NOTICE '✅ Joueurs sélectionnés: sebbultel (%), autres: %, %, %', sebbultel_id, player1_id, player2_id, player3_id;
  
  -- 3. Pour chaque match, vérifier et créer/corriger les RSVPs
  FOREACH current_match_id IN ARRAY match_ids
  LOOP
    -- Vérifier combien de RSVPs existent
    SELECT COUNT(*) INTO rsvp_count
    FROM match_rsvps
    WHERE match_rsvps.match_id = current_match_id;
    
    RAISE NOTICE '🔍 Match %: % RSVPs existants', current_match_id, rsvp_count;
    
    -- Supprimer les RSVPs existants et en créer de nouveaux
    DELETE FROM match_rsvps WHERE match_rsvps.match_id = current_match_id;
    
    -- Créer 4 RSVPs acceptés (incluant sebbultel + 3 autres)
    INSERT INTO match_rsvps (match_id, user_id, status, created_at)
    VALUES
      (current_match_id, sebbultel_id, 'accepted', NOW()),
      (current_match_id, player1_id, 'accepted', NOW()),
      (current_match_id, player2_id, 'accepted', NOW()),
      (current_match_id, player3_id, 'accepted', NOW())
    ON CONFLICT (match_id, user_id) DO UPDATE SET
      status = 'accepted';
    
    RAISE NOTICE '✅ RSVPs créés/corrigés pour match %', current_match_id;
  END LOOP;
  
  RAISE NOTICE '';
  RAISE NOTICE '✅ Tous les RSVPs ont été vérifiés et corrigés!';
  
END $$;

-- Vérifier les RSVPs après correction
SELECT 
  m.id as match_id,
  ts.starts_at,
  COUNT(mr.user_id) FILTER (WHERE mr.status = 'accepted') as total_accepted,
  ARRAY_AGG(mr.user_id) FILTER (WHERE mr.status = 'accepted') as accepted_user_ids,
  BOOL_OR(
    mr.user_id = (SELECT id FROM auth.users WHERE email = 'sebbultel59@gmail.com' LIMIT 1) 
    AND mr.status = 'accepted'
  ) as sebbultel_in_accepted
FROM matches m
JOIN time_slots ts ON ts.id = m.time_slot_id
LEFT JOIN match_rsvps mr ON mr.match_id = m.id AND mr.status = 'accepted'
WHERE m.id IN (
  '2eac7d78-fddc-4752-afff-e71434a41466',
  'fe3e482a-03a3-4975-a2e3-b5775dbd5117',
  '9fb7bcbc-5ba7-4981-849d-5a43c1216de8',
  '9b18fcdb-ac0b-47a6-8348-115e961600ab',
  '9fa0a68b-406e-4031-afa3-baad7bac7c1f'
)
GROUP BY m.id, ts.starts_at
ORDER BY ts.starts_at;

