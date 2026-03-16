-- Ajoute 2 utilisateurs de test + dispos sur les mêmes créneaux que la semaine 16-22 mars
-- (Lun 16, Mer 18, Ven 20 mars 2026, 18h-21h en slots de 30 min)
--
-- Utilisateurs créés :
--   test-dispos-1@padel-sync-test.local  / mot de passe : TestDispos1!
--   test-dispos-2@padel-sync-test.local  / mot de passe : TestDispos2!

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
DECLARE
  uid1 UUID := gen_random_uuid();
  uid2 UUID := gen_random_uuid();
  email1 TEXT := 'test-dispos-1@padel-sync-test.local';
  email2 TEXT := 'test-dispos-2@padel-sync-test.local';
  pwd1 TEXT := 'TestDispos1!';
  pwd2 TEXT := 'TestDispos2!';
BEGIN
  -- 1) Utilisateur 1 (auth.users + profiles)
  INSERT INTO auth.users (
    id, instance_id, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, email_change, email_change_token_new, recovery_token
  )
  VALUES (
    uid1, '00000000-0000-0000-0000-000000000000'::uuid, email1,
    crypt(pwd1, gen_salt('bf')), NOW(),
    '{"provider": "email", "providers": ["email"]}'::jsonb,
    json_build_object('display_name', 'Test Dispos 1')::jsonb, NOW(), NOW(),
    '', '', '', ''
  )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO profiles (id, email, display_name, name, niveau, created_at)
  VALUES (uid1, email1, 'Test Dispos 1', 'Test Dispos 1', '4', NOW())
  ON CONFLICT (id) DO UPDATE SET display_name = EXCLUDED.display_name, name = EXCLUDED.name, email = EXCLUDED.email;

  -- 2) Utilisateur 2 (auth.users + profiles)
  INSERT INTO auth.users (
    id, instance_id, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, email_change, email_change_token_new, recovery_token
  )
  VALUES (
    uid2, '00000000-0000-0000-0000-000000000000'::uuid, email2,
    crypt(pwd2, gen_salt('bf')), NOW(),
    '{"provider": "email", "providers": ["email"]}'::jsonb,
    json_build_object('display_name', 'Test Dispos 2')::jsonb, NOW(), NOW(),
    '', '', '', ''
  )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO profiles (id, email, display_name, name, niveau, created_at)
  VALUES (uid2, email2, 'Test Dispos 2', 'Test Dispos 2', '5', NOW())
  ON CONFLICT (id) DO UPDATE SET display_name = EXCLUDED.display_name, name = EXCLUDED.name, email = EXCLUDED.email;

  -- 3) Dispos (mêmes créneaux : 18 créneaux de 30 min × 2 users = 36 lignes)
  INSERT INTO availability_global (user_id, start, "end", status)
  SELECT u.id, c.start_at, c.end_at, 'available'
  FROM (VALUES (uid1), (uid2)) AS u(id)
  CROSS JOIN (
    SELECT start_at, end_at FROM (VALUES
      ('2026-03-16 18:00:00'::timestamp AT TIME ZONE 'Europe/Paris', '2026-03-16 18:30:00'::timestamp AT TIME ZONE 'Europe/Paris'),
      ('2026-03-16 18:30:00'::timestamp AT TIME ZONE 'Europe/Paris', '2026-03-16 19:00:00'::timestamp AT TIME ZONE 'Europe/Paris'),
      ('2026-03-16 19:00:00'::timestamp AT TIME ZONE 'Europe/Paris', '2026-03-16 19:30:00'::timestamp AT TIME ZONE 'Europe/Paris'),
      ('2026-03-16 19:30:00'::timestamp AT TIME ZONE 'Europe/Paris', '2026-03-16 20:00:00'::timestamp AT TIME ZONE 'Europe/Paris'),
      ('2026-03-16 20:00:00'::timestamp AT TIME ZONE 'Europe/Paris', '2026-03-16 20:30:00'::timestamp AT TIME ZONE 'Europe/Paris'),
      ('2026-03-16 20:30:00'::timestamp AT TIME ZONE 'Europe/Paris', '2026-03-16 21:00:00'::timestamp AT TIME ZONE 'Europe/Paris'),
      ('2026-03-18 18:00:00'::timestamp AT TIME ZONE 'Europe/Paris', '2026-03-18 18:30:00'::timestamp AT TIME ZONE 'Europe/Paris'),
      ('2026-03-18 18:30:00'::timestamp AT TIME ZONE 'Europe/Paris', '2026-03-18 19:00:00'::timestamp AT TIME ZONE 'Europe/Paris'),
      ('2026-03-18 19:00:00'::timestamp AT TIME ZONE 'Europe/Paris', '2026-03-18 19:30:00'::timestamp AT TIME ZONE 'Europe/Paris'),
      ('2026-03-18 19:30:00'::timestamp AT TIME ZONE 'Europe/Paris', '2026-03-18 20:00:00'::timestamp AT TIME ZONE 'Europe/Paris'),
      ('2026-03-18 20:00:00'::timestamp AT TIME ZONE 'Europe/Paris', '2026-03-18 20:30:00'::timestamp AT TIME ZONE 'Europe/Paris'),
      ('2026-03-18 20:30:00'::timestamp AT TIME ZONE 'Europe/Paris', '2026-03-18 21:00:00'::timestamp AT TIME ZONE 'Europe/Paris'),
      ('2026-03-20 18:00:00'::timestamp AT TIME ZONE 'Europe/Paris', '2026-03-20 18:30:00'::timestamp AT TIME ZONE 'Europe/Paris'),
      ('2026-03-20 18:30:00'::timestamp AT TIME ZONE 'Europe/Paris', '2026-03-20 19:00:00'::timestamp AT TIME ZONE 'Europe/Paris'),
      ('2026-03-20 19:00:00'::timestamp AT TIME ZONE 'Europe/Paris', '2026-03-20 19:30:00'::timestamp AT TIME ZONE 'Europe/Paris'),
      ('2026-03-20 19:30:00'::timestamp AT TIME ZONE 'Europe/Paris', '2026-03-20 20:00:00'::timestamp AT TIME ZONE 'Europe/Paris'),
      ('2026-03-20 20:00:00'::timestamp AT TIME ZONE 'Europe/Paris', '2026-03-20 20:30:00'::timestamp AT TIME ZONE 'Europe/Paris'),
      ('2026-03-20 20:30:00'::timestamp AT TIME ZONE 'Europe/Paris', '2026-03-20 21:00:00'::timestamp AT TIME ZONE 'Europe/Paris')
    ) AS t(start_at, end_at)
  ) c
  ON CONFLICT (user_id, start, "end") DO UPDATE SET status = EXCLUDED.status;

  RAISE NOTICE 'Utilisateurs créés : % (%) et % (%)', email1, uid1, email2, uid2;
  RAISE NOTICE 'Dispos ajoutées : 18 créneaux × 2 users = 36 lignes (Lun 16, Mer 18, Ven 20 mars, 18h-21h)';
END $$;
