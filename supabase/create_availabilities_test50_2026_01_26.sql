-- Dispos pour 15 joueurs du groupe "Test 50+ membres"
-- Semaine du lundi 26 janvier 2026 (26/01 -> 01/02)
DO $$
DECLARE
  target_group_id UUID;
  member_ids UUID[];
  day_date DATE;
  slot TEXT;
  start_time TIME;
  end_time TIME;
  start_ts TIMESTAMPTZ;
  end_ts TIMESTAMPTZ;
  created_batches INTEGER := 0;
  slots CONSTANT TEXT[] := ARRAY[
    '09:00-10:30',
    '12:30-14:00',
    '18:30-20:00'
  ];
BEGIN
  -- 1) Trouver le groupe "Test 50+ membres" (variantes)
  SELECT id INTO target_group_id
  FROM groups
  WHERE name ILIKE '%test%50+%membres%'
     OR name ILIKE '%test%50%+%membres%'
     OR name ILIKE '%test 50+ membres%'
     OR name ILIKE '%test 50 + membres%'
     OR name ILIKE '%test 50% membres%'
  LIMIT 1;

  IF target_group_id IS NULL THEN
    RAISE EXCEPTION 'Groupe "Test 50+ membres" non trouvé.';
  END IF;

  RAISE NOTICE '✅ Groupe trouvé: %', target_group_id;

  -- 2) Sélectionner 15 membres du groupe
  SELECT ARRAY_AGG(gm.user_id) INTO member_ids
  FROM (
    SELECT gm.user_id
    FROM group_members gm
    WHERE gm.group_id = target_group_id
    ORDER BY gm.user_id
    LIMIT 15
  ) gm;

  IF member_ids IS NULL OR array_length(member_ids, 1) < 15 THEN
    RAISE EXCEPTION 'Pas assez de membres dans le groupe (besoin de 15).';
  END IF;

  -- 3) Générer les dispos pour la semaine
  FOR day_date IN
    SELECT d::date
    FROM generate_series('2026-01-26'::date, '2026-02-01'::date, interval '1 day') d
  LOOP
    FOREACH slot IN ARRAY slots LOOP
      start_time := split_part(slot, '-', 1)::time;
      end_time := split_part(slot, '-', 2)::time;
      start_ts := (day_date + start_time);
      end_ts := (day_date + end_time);

      INSERT INTO availability (id, group_id, user_id, start, "end", status, created_at)
      SELECT gen_random_uuid(), target_group_id, uid, start_ts, end_ts, 'available', NOW()
      FROM unnest(member_ids) AS uid
      ON CONFLICT (user_id, group_id, start, "end")
      DO UPDATE SET status = EXCLUDED.status;

      created_batches := created_batches + 1;
    END LOOP;
  END LOOP;

  RAISE NOTICE '✅ Dispos créées pour 15 joueurs du groupe %', target_group_id;
  RAISE NOTICE '   Jours: 7 | Slots/jour: % | Batches: %', array_length(slots, 1), created_batches;
END $$;

-- Échantillon
SELECT 
  gm.user_id,
  p.display_name,
  a.start,
  a."end",
  a.status
FROM availability a
JOIN group_members gm ON gm.group_id = a.group_id AND gm.user_id = a.user_id
LEFT JOIN profiles p ON p.id = a.user_id
WHERE a.group_id = (
  SELECT id FROM groups 
  WHERE name ILIKE '%test%50+%membres%'
     OR name ILIKE '%test%50%+%membres%'
     OR name ILIKE '%test 50+ membres%'
     OR name ILIKE '%test 50 + membres%'
     OR name ILIKE '%test 50% membres%'
  LIMIT 1
)
ORDER BY a.start
LIMIT 20;
