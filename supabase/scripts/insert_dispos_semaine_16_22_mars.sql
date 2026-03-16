-- Créer des dispos pour 4 joueurs
-- Semaine du 16 au 22 mars : Lundi 16, Mercredi 18, Vendredi 20
-- Créneaux : 18h00 - 21h00 (Europe/Paris), en slots de 30 min (comme l’app)
-- Emails : sebbultel59@gmail.com, Eps.bultel@clg-arques, bultelseb59@gmail.com, Seb.sax.evenements@gmail.com
--
-- À exécuter dans l’éditeur SQL Supabase ou en CLI : psql ... -f insert_dispos_semaine_16_22_mars.sql
--
-- 1) OPTIONNEL : supprimer les anciennes dispos de cette semaine pour ces 4 utilisateurs (exécuter avant l’INSERT si tu repartirs propre)
/*
DELETE FROM availability_global
WHERE user_id IN (
  SELECT id FROM profiles
  WHERE LOWER(TRIM(email)) IN (
    'sebbultel59@gmail.com',
    'eps.bultel@clg-arques',
    'bultelseb59@gmail.com',
    'seb.sax.evenements@gmail.com'
  )
)
AND start >= ('2026-03-16 00:00:00'::timestamp AT TIME ZONE 'Europe/Paris')
AND "end"  <= ('2026-03-22 23:59:59'::timestamp AT TIME ZONE 'Europe/Paris');
*/

-- 2) OPTIONNEL : annuler la création des 2 joueurs tests et leurs dispos (test-dispos-1/2@padel-sync-test.local)
-- Ordre requis : group_members avant profiles (sinon trigger group_members_leave → notification_jobs viole FK actor_id)
/*
DO $$
DECLARE
  ids UUID[];
BEGIN
  SELECT ARRAY_AGG(id) INTO ids FROM profiles WHERE LOWER(TRIM(email)) IN ('test-dispos-1@padel-sync-test.local', 'test-dispos-2@padel-sync-test.local');
  IF ids IS NOT NULL AND array_length(ids, 1) > 0 THEN
    DELETE FROM availability_global WHERE user_id = ANY(ids);
    DELETE FROM group_members WHERE user_id = ANY(ids);
    DELETE FROM notification_jobs WHERE actor_id = ANY(ids);
    DELETE FROM profiles WHERE id = ANY(ids);
    DELETE FROM auth.users WHERE id = ANY(ids);
    RAISE NOTICE 'Supprimé % utilisateur(s) test et leurs dispos.', array_length(ids, 1);
  ELSE
    RAISE NOTICE 'Aucun utilisateur test trouvé.';
  END IF;
END $$;
*/

WITH joueurs AS (
  SELECT id FROM profiles
  WHERE LOWER(TRIM(email)) IN (
    'sebbultel59@gmail.com',
    'eps.bultel@clg-arques',
    'bultelseb59@gmail.com',
    'seb.sax.evenements@gmail.com'
  )
),
-- 6 créneaux de 30 min par soirée (18h-18h30, 18h30-19h, 19h-19h30, 19h30-20h, 20h-20h30, 20h30-21h) × 3 jours
creneaux AS (
  SELECT start_at, end_at FROM (VALUES
    -- Lundi 16 mars
    ('2026-03-16 18:00:00'::timestamp AT TIME ZONE 'Europe/Paris', '2026-03-16 18:30:00'::timestamp AT TIME ZONE 'Europe/Paris'),
    ('2026-03-16 18:30:00'::timestamp AT TIME ZONE 'Europe/Paris', '2026-03-16 19:00:00'::timestamp AT TIME ZONE 'Europe/Paris'),
    ('2026-03-16 19:00:00'::timestamp AT TIME ZONE 'Europe/Paris', '2026-03-16 19:30:00'::timestamp AT TIME ZONE 'Europe/Paris'),
    ('2026-03-16 19:30:00'::timestamp AT TIME ZONE 'Europe/Paris', '2026-03-16 20:00:00'::timestamp AT TIME ZONE 'Europe/Paris'),
    ('2026-03-16 20:00:00'::timestamp AT TIME ZONE 'Europe/Paris', '2026-03-16 20:30:00'::timestamp AT TIME ZONE 'Europe/Paris'),
    ('2026-03-16 20:30:00'::timestamp AT TIME ZONE 'Europe/Paris', '2026-03-16 21:00:00'::timestamp AT TIME ZONE 'Europe/Paris'),
    -- Mercredi 18 mars
    ('2026-03-18 18:00:00'::timestamp AT TIME ZONE 'Europe/Paris', '2026-03-18 18:30:00'::timestamp AT TIME ZONE 'Europe/Paris'),
    ('2026-03-18 18:30:00'::timestamp AT TIME ZONE 'Europe/Paris', '2026-03-18 19:00:00'::timestamp AT TIME ZONE 'Europe/Paris'),
    ('2026-03-18 19:00:00'::timestamp AT TIME ZONE 'Europe/Paris', '2026-03-18 19:30:00'::timestamp AT TIME ZONE 'Europe/Paris'),
    ('2026-03-18 19:30:00'::timestamp AT TIME ZONE 'Europe/Paris', '2026-03-18 20:00:00'::timestamp AT TIME ZONE 'Europe/Paris'),
    ('2026-03-18 20:00:00'::timestamp AT TIME ZONE 'Europe/Paris', '2026-03-18 20:30:00'::timestamp AT TIME ZONE 'Europe/Paris'),
    ('2026-03-18 20:30:00'::timestamp AT TIME ZONE 'Europe/Paris', '2026-03-18 21:00:00'::timestamp AT TIME ZONE 'Europe/Paris'),
    -- Vendredi 20 mars
    ('2026-03-20 18:00:00'::timestamp AT TIME ZONE 'Europe/Paris', '2026-03-20 18:30:00'::timestamp AT TIME ZONE 'Europe/Paris'),
    ('2026-03-20 18:30:00'::timestamp AT TIME ZONE 'Europe/Paris', '2026-03-20 19:00:00'::timestamp AT TIME ZONE 'Europe/Paris'),
    ('2026-03-20 19:00:00'::timestamp AT TIME ZONE 'Europe/Paris', '2026-03-20 19:30:00'::timestamp AT TIME ZONE 'Europe/Paris'),
    ('2026-03-20 19:30:00'::timestamp AT TIME ZONE 'Europe/Paris', '2026-03-20 20:00:00'::timestamp AT TIME ZONE 'Europe/Paris'),
    ('2026-03-20 20:00:00'::timestamp AT TIME ZONE 'Europe/Paris', '2026-03-20 20:30:00'::timestamp AT TIME ZONE 'Europe/Paris'),
    ('2026-03-20 20:30:00'::timestamp AT TIME ZONE 'Europe/Paris', '2026-03-20 21:00:00'::timestamp AT TIME ZONE 'Europe/Paris')
  ) AS t(start_at, end_at)
)
INSERT INTO availability_global (user_id, start, "end", status)
SELECT j.id, c.start_at, c.end_at, 'available'
FROM joueurs j
CROSS JOIN creneaux c
ON CONFLICT (user_id, start, "end") DO UPDATE SET status = EXCLUDED.status;
