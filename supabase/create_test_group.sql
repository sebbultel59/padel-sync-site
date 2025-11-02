-- Script SQL simple pour créer un groupe de test avec 60 membres
-- À exécuter directement dans Supabase SQL Editor ou via psql

-- S'assurer que l'extension pgcrypto est activée (nécessaire pour crypter les mots de passe)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Configuration: Modifiez ces valeurs selon vos besoins
DO $$
DECLARE
  test_group_id UUID;
  i INTEGER;
  profile_id UUID;
  profile_email TEXT;
  profile_name TEXT;
  surnames TEXT[] := ARRAY[
    'Martin', 'Bernard', 'Dubois', 'Thomas', 'Robert', 'Richard', 'Petit', 'Durand',
    'Leroy', 'Moreau', 'Simon', 'Laurent', 'Lefebvre', 'Michel', 'Garcia', 'David',
    'Bertrand', 'Roux', 'Vincent', 'Fournier', 'Morel', 'Girard', 'André', 'Lefevre',
    'Mercier', 'Dupont', 'Lambert', 'Bonnet', 'François', 'Martinez', 'Legrand', 'Garnier',
    'Faure', 'Rousseau', 'Blanc', 'Guerin', 'Muller', 'Henry', 'Roussel', 'Nicolas',
    'Perrin', 'Morin', 'Mathieu', 'Clement', 'Gauthier', 'Dumont', 'Lopez', 'Fontaine',
    'Chevalier', 'Robin', 'Masson'
  ];
  names TEXT[] := ARRAY[
    'Alexandre', 'Benjamin', 'Camille', 'David', 'Émilie', 'François', 'Gabriel', 'Hélène',
    'Ivan', 'Julie', 'Kevin', 'Laura', 'Marc', 'Nathalie', 'Olivier', 'Pauline',
    'Quentin', 'Rachel', 'Simon', 'Thomas', 'Ulysse', 'Valérie', 'William', 'Yasmine',
    'Zoé', 'Antoine', 'Baptiste', 'Céline', 'Damien', 'Élodie', 'Fabien', 'Guillaume',
    'Hugo', 'Isabelle', 'Jérôme', 'Karine', 'Luc', 'Marion', 'Nicolas', 'Ophélie',
    'Pierre', 'Quitterie', 'Romain', 'Sophie', 'Thibault', 'Ugo', 'Victor', 'Wendy',
    'Xavier', 'Yann', 'Zacharie'
  ];
  -- Niveaux de 1 à 8 (attribués de manière équilibrée)
  levels INTEGER[] := ARRAY[1, 2, 3, 4, 5, 6, 7, 8];
  member_count INTEGER := 60; -- CHANGEZ ICI LE NOMBRE DE MEMBRES
  group_name TEXT := 'Groupe de test - 50+ membres'; -- CHANGEZ ICI LE NOM DU GROUPE
BEGIN
  -- Vérifier si le groupe existe déjà
  SELECT id INTO test_group_id
  FROM groups
  WHERE name = group_name
  LIMIT 1;
  
  -- Si le groupe n'existe pas, le créer
  IF test_group_id IS NULL THEN
    test_group_id := gen_random_uuid();
    INSERT INTO groups (id, name, visibility, join_policy, created_at)
    VALUES (
      test_group_id,
      group_name,
      'public',
      'open',
      NOW()
    );
    RAISE NOTICE '✅ Groupe créé avec l''ID: %', test_group_id;
  ELSE
    RAISE NOTICE 'ℹ️  Groupe existant trouvé avec l''ID: %', test_group_id;
    RAISE NOTICE '   Les membres seront ajoutés à ce groupe existant.';
  END IF;
  
  -- Créer les profils et les ajouter au groupe
  RAISE NOTICE '👤 Création de % membres...', member_count;
  
  FOR i IN 1..member_count LOOP
    profile_id := gen_random_uuid();
    profile_email := 'test-membre-' || i || '-' || extract(epoch from now())::bigint || '@padel-sync-test.local';
    profile_name := names[((i - 1) % array_length(names, 1)) + 1] || ' ' || surnames[((i - 1) % array_length(surnames, 1)) + 1];
    
    -- Créer l'utilisateur dans auth.users d'abord
    -- Note: On crée un utilisateur minimal avec un mot de passe hashé par défaut
    INSERT INTO auth.users (
      id,
      instance_id,
      email,
      encrypted_password,
      email_confirmed_at,
      recovery_sent_at,
      last_sign_in_at,
      raw_app_meta_data,
      raw_user_meta_data,
      created_at,
      updated_at,
      confirmation_token,
      email_change,
      email_change_token_new,
      recovery_token
    )
    VALUES (
      profile_id,
      '00000000-0000-0000-0000-000000000000'::uuid, -- instance_id par défaut
      profile_email,
      crypt('test-password-' || profile_id::text, gen_salt('bf')), -- Mot de passe hashé (bcrypt)
      NOW(), -- email_confirmed_at
      NOW(),
      NOW(),
      '{"provider": "email", "providers": ["email"]}'::jsonb,
      json_build_object('name', profile_name)::jsonb,
      NOW(),
      NOW(),
      '',
      '',
      '',
      ''
    )
    ON CONFLICT (id) DO NOTHING;
    
    -- Créer le profil (qui sera lié à l'utilisateur via la clé étrangère)
    -- Attribuer un niveau de 1 à 8 de manière équilibrée (chaque niveau sera utilisé environ le même nombre de fois)
    INSERT INTO profiles (id, email, display_name, name, niveau, created_at)
    VALUES (
      profile_id,
      profile_email,
      profile_name,
      profile_name,
      levels[((i - 1) % array_length(levels, 1)) + 1]::TEXT, -- Convertir en TEXT pour le champ niveau
      NOW()
    )
    ON CONFLICT (id) DO UPDATE SET
      display_name = EXCLUDED.display_name,
      name = EXCLUDED.name,
      niveau = EXCLUDED.niveau;
    
    -- Ajouter le membre au groupe
    INSERT INTO group_members (group_id, user_id, role)
    VALUES (
      test_group_id,
      profile_id,
      'member'
    )
    ON CONFLICT (group_id, user_id) DO NOTHING;
    
    -- Afficher la progression tous les 10 membres
    IF i % 10 = 0 THEN
      RAISE NOTICE '   Progression: %/% membres créés', i, member_count;
    END IF;
  END LOOP;
  
  -- Afficher le résumé final
  RAISE NOTICE '';
  RAISE NOTICE '✅ Terminé!';
  RAISE NOTICE '   📋 Groupe ID: %', test_group_id;
  RAISE NOTICE '   👥 Nombre total de membres: %', (
    SELECT COUNT(*) FROM group_members WHERE group_id = test_group_id
  );
END $$;

-- Afficher les informations du groupe créé
SELECT 
  g.id as group_id,
  g.name as group_name,
  COUNT(gm.user_id) as member_count,
  g.created_at
FROM groups g
LEFT JOIN group_members gm ON gm.group_id = g.id
WHERE g.name = 'Groupe de test - 50+ membres'
GROUP BY g.id, g.name, g.created_at;

