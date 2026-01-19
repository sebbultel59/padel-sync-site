-- Script SQL pour créer des disponibilités factices pour tous les joueurs du groupe "Les Bras Cassés"
-- avec des matchs possibles avec sebbultel59@gmail.com
-- Période: 29 décembre 2025 au 04 janvier 2026
-- Créneaux: tous les midis et soirs
-- Exceptions: 
--   - Jeudi 1 janvier 2026 toute la journée
--   - Mercredi 31 décembre 2025 après 17h

DO $$
DECLARE
  v_group_id UUID;
  v_sebbultel_id UUID;
  v_member_record RECORD;
  v_current_date DATE;
  v_start_time TIMESTAMPTZ;
  v_end_time TIMESTAMPTZ;
  v_day_name TEXT;
  v_availability_count INTEGER := 0;
  
  -- Créneaux midi et soir
  midi_start TIME := '12:00:00';
  midi_end TIME := '14:00:00';
  soir1_start TIME := '18:00:00';
  soir1_end TIME := '20:00:00';
  soir2_start TIME := '19:00:00';
  soir2_end TIME := '21:00:00';
  soir3_start TIME := '20:00:00';
  soir3_end TIME := '22:00:00';
BEGIN
  -- 1. Trouver le groupe "Les Bras Cassés"
  SELECT id INTO v_group_id
  FROM groups
  WHERE LOWER(name) LIKE '%bras cassés%' OR LOWER(name) LIKE '%bras casses%'
  LIMIT 1;
  
  IF v_group_id IS NULL THEN
    RAISE EXCEPTION 'Groupe "Les Bras Cassés" non trouvé';
  END IF;
  
  RAISE NOTICE '✅ Groupe trouvé: %', v_group_id;
  
  -- 2. Trouver l'utilisateur sebbultel59@gmail.com
  SELECT p.id INTO v_sebbultel_id
  FROM profiles p
  INNER JOIN auth.users u ON u.id = p.id
  WHERE u.email = 'sebbultel59@gmail.com'
  LIMIT 1;
  
  IF v_sebbultel_id IS NULL THEN
    RAISE EXCEPTION 'Utilisateur sebbultel59@gmail.com non trouvé';
  END IF;
  
  -- Vérifier que sebbultel59@gmail.com est membre du groupe
  IF NOT EXISTS (
    SELECT 1 FROM group_members 
    WHERE group_id = v_group_id AND user_id = v_sebbultel_id
  ) THEN
    RAISE EXCEPTION 'L''utilisateur sebbultel59@gmail.com n''est pas membre du groupe "Les Bras Cassés"';
  END IF;
  
  RAISE NOTICE '✅ Utilisateur sebbultel59@gmail.com trouvé: %', v_sebbultel_id;
  
  -- 3. Créer les disponibilités pour chaque jour de la semaine
  -- Du lundi 29 décembre 2025 au dimanche 04 janvier 2026
  FOR v_current_date IN 
    SELECT generate_series(
      '2025-12-29'::DATE,
      '2026-01-04'::DATE,
      '1 day'::INTERVAL
    )::DATE
  LOOP
    v_day_name := TO_CHAR(v_current_date, 'Day'); -- Ex: 'Monday   ', 'Tuesday  ', etc.
    
    -- Vérifier les exceptions
    -- Jeudi 1 janvier 2026: pas de disponibilités toute la journée
    IF v_current_date = '2026-01-01'::DATE THEN
      RAISE NOTICE '⏭️  Jour férié ignoré: % (1er janvier)', v_current_date;
      CONTINUE;
    END IF;
    
    -- Mercredi 31 décembre 2025: pas de disponibilités après 17h
    -- (on créera seulement les créneaux midi)
    
    -- Pour chaque membre du groupe (y compris sebbultel59@gmail.com)
    FOR v_member_record IN 
      SELECT gm.user_id, p.display_name, p.email
      FROM group_members gm
      INNER JOIN profiles p ON p.id = gm.user_id
      WHERE gm.group_id = v_group_id
    LOOP
      -- Créneaux MIDI (12h-14h)
      -- Sauf le 31 décembre après 17h (mais le midi est OK)
      v_start_time := (v_current_date + midi_start)::TIMESTAMPTZ;
      v_end_time := (v_current_date + midi_end)::TIMESTAMPTZ;
      
      INSERT INTO availability (user_id, group_id, start, "end", status)
      VALUES (v_member_record.user_id, v_group_id, v_start_time, v_end_time, 'available')
      ON CONFLICT (user_id, group_id, start, "end") 
      DO UPDATE SET status = 'available';
      
      v_availability_count := v_availability_count + 1;
      
      -- Créneaux SOIR
      -- Sauf le 31 décembre après 17h (donc pas de créneaux soir le 31 décembre)
      IF v_current_date != '2025-12-31'::DATE THEN
        -- Soir 1: 18h-20h
        v_start_time := (v_current_date + soir1_start)::TIMESTAMPTZ;
        v_end_time := (v_current_date + soir1_end)::TIMESTAMPTZ;
        
        INSERT INTO availability (user_id, group_id, start, "end", status)
        VALUES (v_member_record.user_id, v_group_id, v_start_time, v_end_time, 'available')
        ON CONFLICT (user_id, group_id, start, "end") 
        DO UPDATE SET status = 'available';
        
        v_availability_count := v_availability_count + 1;
        
        -- Soir 2: 19h-21h
        v_start_time := (v_current_date + soir2_start)::TIMESTAMPTZ;
        v_end_time := (v_current_date + soir2_end)::TIMESTAMPTZ;
        
        INSERT INTO availability (user_id, group_id, start, "end", status)
        VALUES (v_member_record.user_id, v_group_id, v_start_time, v_end_time, 'available')
        ON CONFLICT (user_id, group_id, start, "end") 
        DO UPDATE SET status = 'available';
        
        v_availability_count := v_availability_count + 1;
        
        -- Soir 3: 20h-22h
        v_start_time := (v_current_date + soir3_start)::TIMESTAMPTZ;
        v_end_time := (v_current_date + soir3_end)::TIMESTAMPTZ;
        
        INSERT INTO availability (user_id, group_id, start, "end", status)
        VALUES (v_member_record.user_id, v_group_id, v_start_time, v_end_time, 'available')
        ON CONFLICT (user_id, group_id, start, "end") 
        DO UPDATE SET status = 'available';
        
        v_availability_count := v_availability_count + 1;
      END IF;
    END LOOP;
    
    RAISE NOTICE '✅ Disponibilités créées pour le %', v_current_date;
  END LOOP;
  
  -- Résumé final
  RAISE NOTICE '';
  RAISE NOTICE '✅ Terminé!';
  RAISE NOTICE '   Groupe: Les Bras Cassés (%)', v_group_id;
  RAISE NOTICE '   Nombre total de disponibilités créées/mises à jour: %', v_availability_count;
  RAISE NOTICE '   Période: 29 décembre 2025 au 04 janvier 2026';
  RAISE NOTICE '   Créneaux: midi (12h-14h) et soirs (18h-20h, 19h-21h, 20h-22h)';
  RAISE NOTICE '   Exceptions: 1er janvier (toute la journée), 31 décembre (après 17h)';
  
  -- Afficher le nombre de disponibilités par joueur
  RAISE NOTICE '';
  RAISE NOTICE '📊 Disponibilités par joueur:';
  FOR v_member_record IN 
    SELECT 
      p.display_name,
      p.email,
      COUNT(a.id) as nb_availabilities
    FROM group_members gm
    INNER JOIN profiles p ON p.id = gm.user_id
    LEFT JOIN availability a ON a.user_id = gm.user_id 
      AND a.group_id = gm.group_id
      AND a.start >= '2025-12-29'::TIMESTAMPTZ
      AND a.start < '2026-01-05'::TIMESTAMPTZ
      AND a.status = 'available'
    WHERE gm.group_id = v_group_id
    GROUP BY p.id, p.display_name, p.email
    ORDER BY p.display_name
  LOOP
    RAISE NOTICE '   - % (%): % disponibilités', 
      v_member_record.display_name, 
      v_member_record.email,
      v_member_record.nb_availabilities;
  END LOOP;
  
END $$;

-- Vérification: Afficher toutes les disponibilités créées
SELECT 
  p.display_name as joueur,
  p.email,
  a.start::DATE as date,
  TO_CHAR(a.start::TIME, 'HH24:MI') as heure_debut,
  TO_CHAR(a."end"::TIME, 'HH24:MI') as heure_fin,
  a.status
FROM availability a
INNER JOIN profiles p ON p.id = a.user_id
INNER JOIN groups g ON g.id = a.group_id
WHERE LOWER(g.name) LIKE '%bras cassés%' OR LOWER(g.name) LIKE '%bras casses%'
  AND a.start >= '2025-12-29'::TIMESTAMPTZ
  AND a.start < '2026-01-05'::TIMESTAMPTZ
  AND a.status = 'available'
ORDER BY a.start, p.display_name;









