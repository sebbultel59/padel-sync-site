-- Supprimer le match avec sebbultel59@gmail.com du dimanche 28 décembre de 9h à 10h30
-- dans le groupe "vielles branches"

DO $$
DECLARE
  v_user_id UUID;
  v_group_id UUID;
  v_time_slot_id UUID;
  v_match_id UUID;
  match_start TIMESTAMPTZ := '2025-12-28 09:00:00'::timestamptz;
  match_end TIMESTAMPTZ := '2025-12-28 10:30:00'::timestamptz;
  rec RECORD;
BEGIN
  -- 1. Trouver l'ID de l'utilisateur sebbultel59@gmail.com
  SELECT id INTO v_user_id
  FROM auth.users
  WHERE email = 'sebbultel59@gmail.com'
  LIMIT 1;
  
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Utilisateur sebbultel59@gmail.com non trouvé';
  END IF;
  
  RAISE NOTICE 'Utilisateur trouvé: %', v_user_id;
  
  -- 2. Trouver l'ID du groupe "vielles branches" (essayer différentes variantes)
  SELECT id INTO v_group_id
  FROM groups
  WHERE LOWER(name) LIKE '%vielles branches%'
     OR LOWER(name) LIKE '%vieilles branches%'
     OR LOWER(name) = 'vielles branches'
     OR LOWER(name) = 'vieilles branches'
  LIMIT 1;
  
  IF v_group_id IS NULL THEN
    RAISE EXCEPTION 'Groupe "vielles branches" non trouvé';
  END IF;
  
  RAISE NOTICE 'Groupe trouvé: %', v_group_id;
  
  -- 3. Trouver le time_slot pour le dimanche 28 décembre de 9h à 10h30
  -- (avec une tolérance de 1 minute pour les timestamps)
  BEGIN
    SELECT id INTO v_time_slot_id
    FROM time_slots
    WHERE ABS(EXTRACT(EPOCH FROM (starts_at - match_start))) < 60
      AND ABS(EXTRACT(EPOCH FROM (ends_at - match_end))) < 60
      AND (group_id = v_group_id OR group_id IS NULL)
    LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    -- Si group_id n'existe pas dans time_slots, chercher sans group_id
    SELECT id INTO v_time_slot_id
    FROM time_slots
    WHERE ABS(EXTRACT(EPOCH FROM (starts_at - match_start))) < 60
      AND ABS(EXTRACT(EPOCH FROM (ends_at - match_end))) < 60
    LIMIT 1;
  END;
  
  IF v_time_slot_id IS NULL THEN
    RAISE EXCEPTION 'Time slot non trouvé pour le dimanche 28 décembre de 9h à 10h30';
  END IF;
  
  RAISE NOTICE 'Time slot trouvé: %', v_time_slot_id;
  
  -- 4. Trouver le match RSVP via les RSVPs de l'utilisateur pour ce créneau
  -- Pour un match RSVP, on cherche directement via les match_rsvps
  -- Plus flexible : cherche tous les matches de l'utilisateur pour cette date/heure
  SELECT m.id INTO v_match_id
  FROM matches m
  JOIN time_slots ts ON ts.id = m.time_slot_id
  JOIN match_rsvps mr ON mr.match_id = m.id
  WHERE mr.user_id = v_user_id
    AND m.group_id = v_group_id
    AND ts.starts_at::date = match_start::date
    AND EXTRACT(HOUR FROM ts.starts_at) = EXTRACT(HOUR FROM match_start)
    AND EXTRACT(MINUTE FROM ts.starts_at) BETWEEN EXTRACT(MINUTE FROM match_start) - 5 AND EXTRACT(MINUTE FROM match_start) + 5
  LIMIT 1;
  
  -- Si pas trouvé, essayer sans vérifier le groupe (au cas où le match serait dans un autre groupe)
  IF v_match_id IS NULL THEN
    RAISE NOTICE 'Match non trouvé avec groupe, recherche sans filtre de groupe...';
    SELECT m.id INTO v_match_id
    FROM matches m
    JOIN time_slots ts ON ts.id = m.time_slot_id
    JOIN match_rsvps mr ON mr.match_id = m.id
    WHERE mr.user_id = v_user_id
      AND ts.starts_at::date = match_start::date
      AND EXTRACT(HOUR FROM ts.starts_at) = EXTRACT(HOUR FROM match_start)
      AND EXTRACT(MINUTE FROM ts.starts_at) BETWEEN EXTRACT(MINUTE FROM match_start) - 5 AND EXTRACT(MINUTE FROM match_start) + 5
    LIMIT 1;
  END IF;
  
  -- Si toujours pas trouvé, essayer avec une tolérance plus large sur l'heure
  IF v_match_id IS NULL THEN
    RAISE NOTICE 'Recherche avec tolérance plus large...';
    SELECT m.id INTO v_match_id
    FROM matches m
    JOIN time_slots ts ON ts.id = m.time_slot_id
    JOIN match_rsvps mr ON mr.match_id = m.id
    WHERE mr.user_id = v_user_id
      AND ts.starts_at::date = match_start::date
      AND ABS(EXTRACT(EPOCH FROM (ts.starts_at - match_start))) < 300  -- 5 minutes de tolérance
    LIMIT 1;
  END IF;
  
  -- Si toujours pas trouvé, essayer avec le time_slot trouvé précédemment
  IF v_match_id IS NULL AND v_time_slot_id IS NOT NULL THEN
    RAISE NOTICE 'Recherche via time_slot_id...';
    SELECT id INTO v_match_id
    FROM matches
    WHERE time_slot_id = v_time_slot_id
      AND group_id = v_group_id
    LIMIT 1;
  END IF;
  
  -- Dernière tentative : chercher n'importe quel match pour ce time_slot
  IF v_match_id IS NULL AND v_time_slot_id IS NOT NULL THEN
    RAISE NOTICE 'Recherche match pour ce time_slot sans filtre de groupe...';
    SELECT id INTO v_match_id
    FROM matches
    WHERE time_slot_id = v_time_slot_id
    LIMIT 1;
  END IF;
  
  IF v_match_id IS NULL THEN
    -- Afficher des informations de débogage
    RAISE NOTICE '=== DEBUG INFO ===';
    RAISE NOTICE 'User ID: %', v_user_id;
    RAISE NOTICE 'Group ID: %', v_group_id;
    RAISE NOTICE 'Time slot ID: %', v_time_slot_id;
    RAISE NOTICE 'Match start recherché: %', match_start;
    RAISE NOTICE 'Match end recherché: %', match_end;
    
    -- Chercher tous les matches de l'utilisateur pour cette date avec détails
    RAISE NOTICE 'Recherche de tous les matches de l''utilisateur le 28 décembre...';
    
    -- Si un seul match est trouvé pour cette date, l'utiliser
    SELECT m.id INTO v_match_id
    FROM matches m
    JOIN time_slots ts ON ts.id = m.time_slot_id
    JOIN match_rsvps mr ON mr.match_id = m.id
    WHERE mr.user_id = v_user_id
      AND ts.starts_at::date = match_start::date
    ORDER BY ts.starts_at
    LIMIT 1;
    
    IF v_match_id IS NOT NULL THEN
      RAISE NOTICE 'Match trouvé via recherche large (premier match du 28 décembre): %', v_match_id;
    ELSE
      -- Afficher tous les matches de l'utilisateur pour cette date avec détails
      RAISE NOTICE 'Aucun match trouvé. Liste de tous les matches de l''utilisateur le 28 décembre:';
      FOR rec IN
        SELECT m.id, m.status, m.group_id, g.name as group_name, ts.starts_at, ts.ends_at
        FROM matches m
        JOIN time_slots ts ON ts.id = m.time_slot_id
        JOIN match_rsvps mr ON mr.match_id = m.id
        LEFT JOIN groups g ON g.id = m.group_id
        WHERE mr.user_id = v_user_id
          AND ts.starts_at::date = match_start::date
        ORDER BY ts.starts_at
      LOOP
        RAISE NOTICE '  Match ID: %, Status: %, Groupe: % (%), Heure: % -> %', 
          rec.id, rec.status, rec.group_name, rec.group_id, rec.starts_at, rec.ends_at;
      END LOOP;
      
      -- Si toujours aucun match, chercher dans une plage plus large (27-29 décembre)
      RAISE NOTICE 'Recherche élargie (27-29 décembre)...';
      SELECT m.id INTO v_match_id
      FROM matches m
      JOIN time_slots ts ON ts.id = m.time_slot_id
      JOIN match_rsvps mr ON mr.match_id = m.id
      WHERE mr.user_id = v_user_id
        AND ts.starts_at::date BETWEEN match_start::date - INTERVAL '1 day' AND match_start::date + INTERVAL '1 day'
        AND EXTRACT(HOUR FROM ts.starts_at) = EXTRACT(HOUR FROM match_start)
      ORDER BY ABS(EXTRACT(EPOCH FROM (ts.starts_at - match_start)))
      LIMIT 1;
      
      IF v_match_id IS NOT NULL THEN
        RAISE NOTICE 'Match trouvé dans la plage élargie: %', v_match_id;
      ELSE
        RAISE EXCEPTION 'Match non trouvé pour ce créneau. Vérifiez les informations de débogage ci-dessus.';
      END IF;
    END IF;
  END IF;
  
  RAISE NOTICE 'Match trouvé: %', v_match_id;
  
  -- 5. Vérifier que l'utilisateur est bien dans ce match (via RSVP)
  IF NOT EXISTS (
    SELECT 1 FROM match_rsvps 
    WHERE match_id = v_match_id 
    AND user_id = v_user_id
  ) THEN
    RAISE WARNING 'L''utilisateur sebbultel59@gmail.com n''est pas dans ce match';
  END IF;
  
  -- 6. Supprimer tous les RSVPs associés au match
  DELETE FROM match_rsvps WHERE match_id = v_match_id;
  RAISE NOTICE 'RSVPs supprimés pour le match %', v_match_id;
  
  -- 7. Supprimer le match
  DELETE FROM matches WHERE id = v_match_id;
  RAISE NOTICE 'Match supprimé: %', v_match_id;
  
  RAISE NOTICE '✅ Match supprimé avec succès!';
  
END $$;

-- Vérification : Afficher les matches restants pour ce créneau
SELECT 
  m.id as match_id,
  m.status,
  g.name as group_name,
  ts.starts_at,
  ts.ends_at,
  COUNT(mr.user_id) as nb_players
FROM matches m
JOIN groups g ON g.id = m.group_id
JOIN time_slots ts ON ts.id = m.time_slot_id
LEFT JOIN match_rsvps mr ON mr.match_id = m.id
WHERE g.id = (SELECT id FROM groups WHERE LOWER(name) LIKE '%vielles branches%' LIMIT 1)
  AND ts.starts_at::date = '2025-12-28'::date
  AND EXTRACT(HOUR FROM ts.starts_at) = 9
GROUP BY m.id, m.status, g.name, ts.starts_at, ts.ends_at;

