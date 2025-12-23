-- Script pour mettre à jour les dates des matchs confirmés pour qu'ils soient dans le futur
-- Met à jour les time_slots pour qu'ils soient dans la semaine prochaine

DO $$
DECLARE
  test_group_id UUID := '9ad6a176-1935-416e-9ab3-ddba4d76434a';
  match_ids UUID[] := ARRAY[
    '2eac7d78-fddc-4752-afff-e71434a41466',
    'fe3e482a-03a3-4975-a2e3-b5775dbd5117',
    '9fb7bcbc-5ba7-4981-849d-5a43c1216de8',
    '9b18fcdb-ac0b-47a6-8348-115e961600ab',
    '9fa0a68b-406e-4031-afa3-baad7bac7c1f'
  ];
  current_match_id UUID;
  new_start_date TIMESTAMPTZ;
  new_end_date TIMESTAMPTZ;
  day_offset INTEGER := 0;
  base_date DATE;
  existing_slot_id UUID;
  current_slot_id UUID;
  current_slot_starts_at TIMESTAMPTZ;
  current_slot_ends_at TIMESTAMPTZ;
BEGIN
  -- Calculer la date de base : prochain dimanche (début de semaine)
  base_date := CURRENT_DATE;
  -- Trouver le prochain dimanche
  WHILE EXTRACT(DOW FROM base_date) != 0 LOOP
    base_date := base_date + INTERVAL '1 day';
  END LOOP;
  
  -- Si on est déjà dimanche, prendre le dimanche suivant
  IF EXTRACT(DOW FROM CURRENT_DATE) = 0 THEN
    base_date := base_date + INTERVAL '7 days';
  END IF;
  
  RAISE NOTICE '📅 Date de base (début de semaine): %', base_date;
  
  -- Pour chaque match, mettre à jour le time_slot
  FOREACH current_match_id IN ARRAY match_ids
  LOOP
    -- Réinitialiser les variables
    existing_slot_id := NULL;
    current_slot_id := NULL;
    
    -- Date : base_date + day_offset jours, à 18h00
    new_start_date := (base_date + make_interval(days => day_offset))::date + TIME '18:00:00';
    new_end_date := new_start_date + INTERVAL '1 hour 30 minutes';
    
    -- Récupérer le time_slot_id actuel du match
    SELECT time_slot_id INTO current_slot_id
    FROM matches
    WHERE id = current_match_id;
    
    -- Vérifier si le time_slot actuel a déjà les bonnes dates
    SELECT starts_at, ends_at INTO current_slot_starts_at, current_slot_ends_at
    FROM time_slots
    WHERE id = current_slot_id;
    
    IF current_slot_starts_at = new_start_date AND current_slot_ends_at = new_end_date THEN
      -- Le time_slot actuel a déjà les bonnes dates, rien à faire
      RAISE NOTICE '✅ Match %: time_slot % a déjà les bonnes dates (dates: % -> %)', 
        current_match_id, current_slot_id, new_start_date, new_end_date;
    ELSE
      -- Essayer de mettre à jour le time_slot actuel
      BEGIN
        UPDATE time_slots
        SET starts_at = new_start_date,
            ends_at = new_end_date
        WHERE id = current_slot_id;
        
        RAISE NOTICE '✅ Match %: time_slot % mis à jour (dates: % -> %)', 
          current_match_id, current_slot_id, new_start_date, new_end_date;
      EXCEPTION WHEN unique_violation THEN
        -- Si conflit (time_slots_group_id_starts_at_ends_at_key), créer un nouveau time_slot
        existing_slot_id := gen_random_uuid();
        INSERT INTO time_slots (id, group_id, starts_at, ends_at)
        VALUES (existing_slot_id, test_group_id, new_start_date, new_end_date);
        
        -- Mettre à jour le match pour utiliser le nouveau time_slot
        UPDATE matches
        SET time_slot_id = existing_slot_id
        WHERE id = current_match_id;
        
        RAISE NOTICE '✅ Match %: nouveau time_slot % créé (dates: % -> %)', 
          current_match_id, existing_slot_id, new_start_date, new_end_date;
      END;
    END IF;
    
    day_offset := day_offset + 1;
  END LOOP;
  
  RAISE NOTICE '';
  RAISE NOTICE '✅ Toutes les dates ont été mises à jour!';
  RAISE NOTICE '   Semaine: % au %', base_date, base_date + INTERVAL '6 days';
  
END $$;

-- Vérifier les dates après mise à jour
SELECT 
  m.id as match_id,
  m.status,
  ts.starts_at,
  ts.ends_at,
  CASE 
    WHEN ts.ends_at > NOW() THEN 'FUTUR ✅'
    ELSE 'PASSÉ ❌'
  END as statut_date,
  COUNT(mr.user_id) FILTER (WHERE mr.status = 'accepted') as rsvps_acceptes
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
GROUP BY m.id, m.status, ts.starts_at, ts.ends_at
ORDER BY ts.starts_at;

