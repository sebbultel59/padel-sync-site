-- Créer des disponibilités pour générer des matchs possibles
-- Groupe "de test - 50+ membres"
-- Semaine du 19 au 25 janvier 2026

DO $$
DECLARE
  target_group_id UUID;
  sebbultel_id UUID;
  member_ids UUID[];
  all_ids UUID[];
  day_date DATE;
  slot TEXT;
  start_time TIME;
  end_time TIME;
  start_ts TIMESTAMPTZ;
  end_ts TIMESTAMPTZ;
  created_count INTEGER := 0;
  slots CONSTANT TEXT[] := ARRAY[
    '09:00-10:30',
    '12:30-14:00',
    '18:30-20:00'
  ];
BEGIN
  -- 1) Groupe "de test - 50+ membres"
  SELECT id INTO target_group_id
  FROM groups
  WHERE trim(name) = 'de test - 50+ membres'
     OR name ILIKE '%de test - 50+ membres%'
  LIMIT 1;

  IF target_group_id IS NULL THEN
    RAISE EXCEPTION 'Groupe "de test - 50+ membres" non trouvé';
  END IF;

  -- 2) Utilisateur sebbultel59@gmail.com
  SELECT id INTO sebbultel_id
  FROM auth.users
  WHERE email = 'sebbultel59@gmail.com'
  LIMIT 1;

  IF sebbultel_id IS NULL THEN
    RAISE EXCEPTION 'Utilisateur sebbultel59@gmail.com non trouvé';
  END IF;

  -- 3) Sélectionner d'autres membres (7) avec profil
  SELECT ARRAY_AGG(gm.user_id) INTO member_ids
  FROM (
    SELECT gm.user_id
    FROM group_members gm
    JOIN profiles p ON p.id = gm.user_id
    WHERE gm.group_id = target_group_id
      AND gm.user_id <> sebbultel_id
    ORDER BY gm.user_id
    LIMIT 7
  ) gm;

  IF member_ids IS NULL OR array_length(member_ids, 1) < 3 THEN
    RAISE EXCEPTION 'Pas assez de membres dans le groupe pour créer des matchs possibles';
  END IF;

  -- 4) Liste des joueurs concernés (sebbultel + autres)
  all_ids := ARRAY_APPEND(member_ids, sebbultel_id);

  -- 5) Générer les disponibilités pour la semaine du 19 au 25 janvier 2026
  FOR day_date IN
    SELECT d::date
    FROM generate_series('2026-01-19'::date, '2026-01-25'::date, interval '1 day') d
  LOOP
    FOREACH slot IN ARRAY slots LOOP
      -- Décomposer "HH:MM-HH:MM"
      start_time := split_part(slot, '-', 1)::time;
      end_time := split_part(slot, '-', 2)::time;
      start_ts := (day_date + start_time);
      end_ts := (day_date + end_time);

      -- Insérer une dispo "available" pour chaque joueur
      INSERT INTO availability (id, group_id, user_id, start, "end", status, created_at)
      SELECT gen_random_uuid(), target_group_id, uid, start_ts, end_ts, 'available', NOW()
      FROM unnest(all_ids) AS uid
      ON CONFLICT (user_id, group_id, start, "end")
      DO UPDATE SET status = EXCLUDED.status;

      created_count := created_count + 1;
    END LOOP;
  END LOOP;

  RAISE NOTICE '✅ Dispos créées pour le groupe %, semaine 19–25 janv. 2026', target_group_id;
  RAISE NOTICE '   Slots/jour: %, joueurs: %, total lots: %', array_length(slots, 1), array_length(all_ids, 1), created_count;
END $$;

-- Vérification rapide
SELECT 
  a.start::date AS jour,
  COUNT(*) FILTER (WHERE a.status = 'available') AS nb_dispos,
  COUNT(DISTINCT a.user_id) AS nb_joueurs
FROM availability a
WHERE a.group_id = (
  SELECT id FROM groups
  WHERE name = 'de test - 50+ membres'
  LIMIT 1
)
  AND a.start::date BETWEEN '2026-01-19' AND '2026-01-25'
GROUP BY a.start::date
ORDER BY jour;
