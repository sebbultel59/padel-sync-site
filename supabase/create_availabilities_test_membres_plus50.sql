-- Script pour créer des disponibilités aléatoires pour plus de 50 membres
-- dans le groupe "test membres +50" (ou variantes)
-- Génère des créneaux aléatoires sur les prochaines semaines

DO $$
DECLARE
  test_group_id UUID;
  member_record RECORD;
  availability_id UUID;
  start_time TIMESTAMPTZ;
  end_time TIMESTAMPTZ;
  slot_date DATE;
  slot_hour INTEGER;
  slot_minute INTEGER;
  slot_duration_min INTEGER;
  status_value TEXT;
  members_count INTEGER;
  availabilities_per_member INTEGER;
  days_ahead INTEGER;
  current_member_count INTEGER := 0;
  total_availabilities_created INTEGER := 0;
BEGIN
  -- Récupérer l'ID du groupe "test membres +50" (chercher plusieurs variantes)
  SELECT id INTO test_group_id
  FROM groups
  WHERE name ILIKE '%test%membres%+50%' 
     OR name ILIKE '%test%membres%50%'
     OR name ILIKE '%test membres +50%'
     OR name ILIKE '%test membres + 50%'
     OR name = 'test membres +50'
     OR name = 'test membres + 50'
     OR name = 'Groupe de test - 50+ membres'
  LIMIT 1;
  
  IF test_group_id IS NULL THEN
    RAISE EXCEPTION 'Groupe "test membres +50" non trouvé. Vérifiez que le groupe existe avec ce nom ou une variante.';
  END IF;
  
  RAISE NOTICE '✅ Groupe trouvé: %', test_group_id;
  
  -- Compter les membres
  SELECT COUNT(*) INTO members_count
  FROM group_members
  WHERE group_id = test_group_id;
  
  RAISE NOTICE '👥 Nombre de membres: %', members_count;
  
  IF members_count < 50 THEN
    RAISE WARNING 'Le groupe ne contient que % membres, moins que les 50 attendus', members_count;
  END IF;
  
  -- Paramètres configurables
  availabilities_per_member := 25; -- Nombre de créneaux par membre (augmenté pour avoir plus de données)
  days_ahead := 60; -- Nombre de jours à venir pour générer les disponibilités (2 mois)
  
  RAISE NOTICE '📅 Génération de % créneaux par membre sur les % prochains jours...', availabilities_per_member, days_ahead;
  RAISE NOTICE '   Total estimé: % disponibilités', members_count * availabilities_per_member;
  
  -- Parcourir tous les membres du groupe
  FOR member_record IN 
    SELECT user_id 
    FROM group_members 
    WHERE group_id = test_group_id
    ORDER BY user_id
  LOOP
    current_member_count := current_member_count + 1;
    
    -- Générer plusieurs disponibilités aléatoires pour ce membre
    FOR i IN 1..availabilities_per_member LOOP
      availability_id := gen_random_uuid();
      
      -- Générer une date aléatoire dans les jours à venir
      slot_date := CURRENT_DATE + (random() * days_ahead)::INTEGER;
      
      -- Générer une heure aléatoire entre 7h et 22h (horaires de padel)
      slot_hour := 7 + (random() * 15)::INTEGER; -- 7 à 22h
      slot_minute := CASE 
        WHEN random() < 0.5 THEN 0  -- 50% de chance d'être à l'heure pile
        WHEN random() < 0.75 THEN 30  -- 25% de chance d'être à 30 minutes
        ELSE (random() * 60)::INTEGER  -- 25% de chance d'être aléatoire
      END;
      
      -- Générer une durée aléatoire (60, 90 ou 120 minutes, avec préférence pour 90)
      slot_duration_min := CASE 
        WHEN random() < 0.6 THEN 90  -- 60% de chance de 90 minutes (durée standard padel)
        WHEN random() < 0.85 THEN 60  -- 25% de chance de 60 minutes
        ELSE 120  -- 15% de chance de 120 minutes
      END;
      
      -- Construire le timestamp de début
      start_time := (slot_date + make_interval(hours => slot_hour, mins => slot_minute));
      
      -- Construire le timestamp de fin
      end_time := start_time + make_interval(mins => slot_duration_min);
      
      -- Attribuer un status aléatoire (avec préférence pour 'available')
      status_value := CASE 
        WHEN random() < 0.7 THEN 'available'  -- 70% de chance d'être disponible
        WHEN random() < 0.9 THEN 'neutral'   -- 20% de chance d'être neutre
        ELSE 'busy'  -- 10% de chance d'être occupé
      END;
      
      -- Insérer la disponibilité
      BEGIN
        INSERT INTO availability (id, group_id, user_id, start, "end", status, created_at)
        VALUES (
          availability_id,
          test_group_id,
          member_record.user_id,
          start_time,
          end_time,
          status_value,
          NOW()
        )
        ON CONFLICT (user_id, group_id, start, "end") DO NOTHING; -- Ignorer si conflit
        
        -- Compter les insertions réussies
        IF FOUND THEN
          total_availabilities_created := total_availabilities_created + 1;
        END IF;
      EXCEPTION WHEN OTHERS THEN
        -- Ignorer les erreurs silencieusement pour continuer avec les autres membres
        NULL;
      END;
      
    END LOOP;
    
    -- Afficher la progression tous les 10 membres
    IF current_member_count % 10 = 0 THEN
      RAISE NOTICE '   Progression: %/% membres traités... (% disponibilités créées)', 
        current_member_count, members_count, total_availabilities_created;
    END IF;
  END LOOP;
  
  -- Afficher le résumé final
  RAISE NOTICE '';
  RAISE NOTICE '✅ Terminé!';
  RAISE NOTICE '   👥 Membres traités: %', current_member_count;
  RAISE NOTICE '   📅 Disponibilités créées: %', total_availabilities_created;
  RAISE NOTICE '   📊 Statistiques par statut:';
  RAISE NOTICE '      - Available: %', (
    SELECT COUNT(*) 
    FROM availability 
    WHERE group_id = test_group_id AND status = 'available'
  );
  RAISE NOTICE '      - Neutral: %', (
    SELECT COUNT(*) 
    FROM availability 
    WHERE group_id = test_group_id AND status = 'neutral'
  );
  RAISE NOTICE '      - Busy: %', (
    SELECT COUNT(*) 
    FROM availability 
    WHERE group_id = test_group_id AND status = 'busy'
  );
  RAISE NOTICE '   📈 Total disponibilités dans le groupe: %', (
    SELECT COUNT(*) 
    FROM availability 
    WHERE group_id = test_group_id
  );
END $$;

-- Afficher un échantillon des disponibilités créées
SELECT 
  gm.user_id,
  p.display_name,
  a.start,
  a."end",
  a.status,
  EXTRACT(EPOCH FROM (a."end" - a.start))/60 as duration_minutes
FROM availability a
JOIN group_members gm ON gm.group_id = a.group_id AND gm.user_id = a.user_id
LEFT JOIN profiles p ON p.id = a.user_id
WHERE a.group_id = (
  SELECT id FROM groups 
  WHERE name ILIKE '%test%membres%+50%' 
     OR name ILIKE '%test%membres%50%'
     OR name ILIKE '%test membres +50%'
     OR name ILIKE '%test membres + 50%'
     OR name = 'test membres +50'
     OR name = 'test membres + 50'
     OR name = 'Groupe de test - 50+ membres'
  LIMIT 1
)
ORDER BY a.start
LIMIT 30;

-- Afficher les statistiques par membre
SELECT 
  p.display_name,
  COUNT(*) as nb_dispos,
  COUNT(*) FILTER (WHERE a.status = 'available') as nb_available,
  COUNT(*) FILTER (WHERE a.status = 'neutral') as nb_neutral,
  COUNT(*) FILTER (WHERE a.status = 'busy') as nb_busy
FROM availability a
JOIN group_members gm ON gm.group_id = a.group_id AND gm.user_id = a.user_id
LEFT JOIN profiles p ON p.id = a.user_id
WHERE a.group_id = (
  SELECT id FROM groups 
  WHERE name ILIKE '%test%membres%+50%' 
     OR name ILIKE '%test%membres%50%'
     OR name ILIKE '%test membres +50%'
     OR name ILIKE '%test membres + 50%'
     OR name = 'test membres +50'
     OR name = 'test membres + 50'
     OR name = 'Groupe de test - 50+ membres'
  LIMIT 1
)
GROUP BY p.display_name, a.user_id
ORDER BY nb_dispos DESC
LIMIT 20;

