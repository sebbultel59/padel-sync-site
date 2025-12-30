-- Script SQL pour créer des joueurs factices complets pour la démo
-- Groupe: "les bras cassés"
-- Date: 2025-01-XX
-- Description: Crée des profils complets avec toutes les informations nécessaires pour une démo

-- Activer les extensions nécessaires
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Fonction pour créer un joueur factice complet
DO $$
DECLARE
  v_group_id UUID;
  v_profile_id UUID;
  i INTEGER;
  
  -- Données des joueurs
  players_data JSONB := '[
    {"name": "Alexandre", "surname": "Martin", "niveau": "4", "main": "droite", "cote": "gauche", "phone": "+33612345678", "club": "Padel Club Paris", "address": "15 Rue de la Paix, 75002 Paris", "lat": 48.8698, "lng": 2.3314},
    {"name": "Sophie", "surname": "Bernard", "niveau": "5", "main": "droite", "cote": "droite", "phone": "+33623456789", "club": "Padel Club Paris", "address": "42 Avenue des Champs-Élysées, 75008 Paris", "lat": 48.8698, "lng": 2.3077},
    {"name": "Thomas", "surname": "Dubois", "niveau": "3", "main": "gauche", "cote": "gauche", "phone": "+33634567890", "club": "Padel Club Lyon", "address": "10 Place Bellecour, 69002 Lyon", "lat": 45.7578, "lng": 4.8320},
    {"name": "Camille", "surname": "Moreau", "niveau": "6", "main": "droite", "cote": "droite", "phone": "+33645678901", "club": "Padel Club Marseille", "address": "1 Canebière, 13001 Marseille", "lat": 43.2965, "lng": 5.3698},
    {"name": "Lucas", "surname": "Leroy", "niveau": "4", "main": "droite", "cote": "gauche", "phone": "+33656789012", "club": "Padel Club Paris", "address": "25 Rue de Rivoli, 75004 Paris", "lat": 48.8566, "lng": 2.3522},
    {"name": "Emma", "surname": "Petit", "niveau": "5", "main": "gauche", "cote": "droite", "phone": "+33667890123", "club": "Padel Club Nice", "address": "5 Promenade des Anglais, 06000 Nice", "lat": 43.7102, "lng": 7.2620},
    {"name": "Hugo", "surname": "Durand", "niveau": "3", "main": "droite", "cote": "gauche", "phone": "+33678901234", "club": "Padel Club Bordeaux", "address": "Place de la Comédie, 33000 Bordeaux", "lat": 44.8378, "lng": -0.5792},
    {"name": "Léa", "surname": "Simon", "niveau": "7", "main": "droite", "cote": "droite", "phone": "+33689012345", "club": "Padel Club Toulouse", "address": "1 Place du Capitole, 31000 Toulouse", "lat": 43.6047, "lng": 1.4442},
    {"name": "Nathan", "surname": "Laurent", "niveau": "4", "main": "gauche", "cote": "gauche", "phone": "+33690123456", "club": "Padel Club Lille", "address": "Grand Place, 59000 Lille", "lat": 50.6292, "lng": 3.0573},
    {"name": "Chloé", "surname": "Lefebvre", "niveau": "6", "main": "droite", "cote": "droite", "phone": "+33601234567", "club": "Padel Club Strasbourg", "address": "Place Kléber, 67000 Strasbourg", "lat": 48.5839, "lng": 7.7455}
  ]'::JSONB;
  
  player_data JSONB;
  display_name TEXT;
  email TEXT;
  phone TEXT;
  club TEXT;
  address_home JSONB;
  address_work JSONB;
BEGIN
  -- Trouver ou créer le groupe "les bras cassés"
  SELECT id INTO v_group_id
  FROM groups
  WHERE LOWER(name) LIKE '%bras cassés%' OR LOWER(name) LIKE '%bras casses%'
  LIMIT 1;
  
  IF v_group_id IS NULL THEN
    -- Créer le groupe s'il n'existe pas
    v_group_id := gen_random_uuid();
    INSERT INTO groups (id, name, visibility, join_policy, created_at)
    VALUES (
      v_group_id,
      'Les Bras Cassés',
      'public',
      'open',
      NOW()
    );
    RAISE NOTICE '✅ Groupe "Les Bras Cassés" créé avec l''ID: %', v_group_id;
  ELSE
    RAISE NOTICE '✅ Groupe "Les Bras Cassés" trouvé avec l''ID: %', v_group_id;
  END IF;
  
  -- Créer les joueurs factices
  FOR i IN 0..jsonb_array_length(players_data) - 1 LOOP
    player_data := players_data->i;
    
    v_profile_id := gen_random_uuid();
    display_name := (player_data->>'name') || ' ' || (player_data->>'surname');
    email := LOWER((player_data->>'name') || '.' || (player_data->>'surname') || '@demo-padel-sync.local');
    phone := player_data->>'phone';
    club := player_data->>'club';
    
    -- Créer l'adresse home
    address_home := jsonb_build_object(
      'address', player_data->>'address',
      'lat', (player_data->>'lat')::DOUBLE PRECISION,
      'lng', (player_data->>'lng')::DOUBLE PRECISION
    );
    
    -- Créer l'adresse work (optionnelle, différente de home)
    address_work := jsonb_build_object(
      'address', 'Bureau ' || (player_data->>'address'),
      'lat', ((player_data->>'lat')::DOUBLE PRECISION + 0.01),
      'lng', ((player_data->>'lng')::DOUBLE PRECISION + 0.01)
    );
    
    -- Créer l'utilisateur dans auth.users
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
      v_profile_id,
      '00000000-0000-0000-0000-000000000000'::uuid,
      email,
      crypt('demo-password-123', gen_salt('bf')),
      NOW(),
      NOW(),
      NOW(),
      '{"provider": "email", "providers": ["email"]}'::jsonb,
      jsonb_build_object('name', display_name),
      NOW(),
      NOW(),
      '',
      '',
      '',
      ''
    )
    ON CONFLICT (id) DO NOTHING;
    
    -- Créer le profil complet
    INSERT INTO profiles (
      id,
      email,
      display_name,
      name,
      niveau,
      main,
      cote,
      phone,
      club,
      address_home,
      address_work,
      rayon_km,
      role,
      created_at
    )
    VALUES (
      v_profile_id,
      email,
      display_name,
      display_name,
      (player_data->>'niveau')::TEXT,
      (player_data->>'main')::TEXT,
      (player_data->>'cote')::TEXT,
      phone,
      club,
      address_home,
      address_work,
      20, -- Rayon de 20 km par défaut
      'player',
      NOW()
    )
    ON CONFLICT (id) DO UPDATE SET
      display_name = EXCLUDED.display_name,
      name = EXCLUDED.name,
      niveau = EXCLUDED.niveau,
      main = EXCLUDED.main,
      cote = EXCLUDED.cote,
      phone = EXCLUDED.phone,
      club = EXCLUDED.club,
      address_home = EXCLUDED.address_home,
      address_work = EXCLUDED.address_work,
      rayon_km = EXCLUDED.rayon_km;
    
    -- Ajouter le joueur au groupe
    INSERT INTO group_members (group_id, user_id, role)
    VALUES (
      v_group_id,
      v_profile_id,
      'member'
    )
    ON CONFLICT (group_id, user_id) DO NOTHING;
    
    RAISE NOTICE '✅ Joueur créé: % (%) - Niveau % - %/%', 
      display_name, email, player_data->>'niveau', player_data->>'main', player_data->>'cote';
  END LOOP;
  
  -- Afficher le résumé
  RAISE NOTICE '';
  RAISE NOTICE '✅ Terminé!';
  RAISE NOTICE '   Groupe ID: %', v_group_id;
  RAISE NOTICE '   Nombre de joueurs créés: %', jsonb_array_length(players_data);
  RAISE NOTICE '   Total de membres dans le groupe: %', (
    SELECT COUNT(*) FROM group_members WHERE group_members.group_id = v_group_id
  );
  
  -- Note: La liste détaillée des joueurs sera affichée par la requête SELECT finale
END $$;

-- Vérification finale - Résumé
SELECT 
  g.name as groupe,
  COUNT(gm.user_id) as nombre_membres,
  COUNT(CASE WHEN p.niveau IS NOT NULL THEN 1 END) as avec_niveau,
  COUNT(CASE WHEN p.main IS NOT NULL THEN 1 END) as avec_main,
  COUNT(CASE WHEN p.cote IS NOT NULL THEN 1 END) as avec_cote,
  COUNT(CASE WHEN p.phone IS NOT NULL THEN 1 END) as avec_telephone,
  COUNT(CASE WHEN p.club IS NOT NULL THEN 1 END) as avec_club,
  COUNT(CASE WHEN p.address_home IS NOT NULL THEN 1 END) as avec_adresse
FROM groups g
LEFT JOIN group_members gm ON gm.group_id = g.id
LEFT JOIN profiles p ON p.id = gm.user_id
WHERE LOWER(g.name) LIKE '%bras cassés%' OR LOWER(g.name) LIKE '%bras casses%'
GROUP BY g.id, g.name;

-- Liste détaillée des joueurs créés
SELECT 
  p.display_name as nom,
  p.email,
  p.niveau,
  p.main as main,
  p.cote as côté,
  p.club,
  p.phone as téléphone,
  p.address_home->>'address' as adresse_domicile,
  p.rayon_km as rayon_km
FROM profiles p
INNER JOIN group_members gm ON gm.user_id = p.id
INNER JOIN groups g ON g.id = gm.group_id
WHERE LOWER(g.name) LIKE '%bras cassés%' OR LOWER(g.name) LIKE '%bras casses%'
ORDER BY p.display_name;

