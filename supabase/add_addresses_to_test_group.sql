-- Script pour ajouter des adresses domicile et un rayon_km aux membres du groupe de test
-- Utilise des villes du Nord de la France avec des coordonnées GPS

-- S'assurer que la colonne rayon_km existe dans profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS rayon_km INTEGER;

DO $$
DECLARE
  test_group_id UUID;
  member_record RECORD;
  city_name TEXT;
  city_lat DOUBLE PRECISION;
  city_lng DOUBLE PRECISION;
  street_number INTEGER;
  street_name TEXT;
  full_address TEXT;
  address_home_json JSONB;
  rayon_value INTEGER;
  cities TEXT[] := ARRAY[
    'Hazebrouck',
    'Saint-Omer',
    'Blaringhem',
    'Ebblinghem',
    'Arques',
    'Renescure',
    'Longuenesse'
  ];
  -- Coordonnées GPS approximatives pour chaque ville
  cities_lat DOUBLE PRECISION[] := ARRAY[
    50.7236,  -- Hazebrouck
    50.7481,  -- Saint-Omer
    50.7667,  -- Blaringhem
    50.8956,  -- Ebblinghem
    50.7347,  -- Arques
    50.7333,  -- Renescure
    50.7372   -- Longuenesse
  ];
  cities_lng DOUBLE PRECISION[] := ARRAY[
    2.5375,   -- Hazebrouck
    2.2594,   -- Saint-Omer
    2.4000,   -- Blaringhem
    2.4181,   -- Ebblinghem
    2.3025,   -- Arques
    2.0667,   -- Renescure
    2.2542    -- Longuenesse
  ];
  streets TEXT[] := ARRAY[
    'Rue de la République',
    'Rue du Général de Gaulle',
    'Rue de l''Église',
    'Rue du Marais',
    'Avenue de la Gare',
    'Rue Victor Hugo',
    'Place de la Mairie',
    'Rue des Écoles',
    'Rue Pasteur',
    'Rue Jean Jaurès',
    'Rue de Lille',
    'Rue de Dunkerque',
    'Rue des Fleurs',
    'Rue du Stade',
    'Rue du Commerce'
  ];
  members_count INTEGER;
  current_member_count INTEGER := 0;
  city_index INTEGER;
BEGIN
  -- Récupérer l'ID du groupe de test
  SELECT id INTO test_group_id
  FROM groups
  WHERE name = 'Groupe de test - 50+ membres'
  LIMIT 1;
  
  IF test_group_id IS NULL THEN
    RAISE EXCEPTION 'Groupe "Groupe de test - 50+ membres" non trouvé. Exécutez d''abord create_test_group.sql';
  END IF;
  
  RAISE NOTICE '✅ Groupe trouvé: %', test_group_id;
  
  -- Compter les membres
  SELECT COUNT(*) INTO members_count
  FROM group_members
  WHERE group_id = test_group_id;
  
  RAISE NOTICE '👥 Nombre de membres: %', members_count;
  RAISE NOTICE '📍 Attribution d''adresses aléatoires...';
  
  -- Parcourir tous les membres du groupe
  FOR member_record IN 
    SELECT user_id 
    FROM group_members 
    WHERE group_id = test_group_id
  LOOP
    current_member_count := current_member_count + 1;
    
    -- Sélectionner une ville aléatoire
    city_index := 1 + (random() * (array_length(cities, 1) - 1))::INTEGER;
    city_name := cities[city_index];
    
    -- Ajouter une petite variation aléatoire autour des coordonnées de la ville (environ 1-2 km)
    -- Cela simule des adresses différentes dans la même ville
    city_lat := cities_lat[city_index] + (random() - 0.5) * 0.02; -- ±0.01 degré ≈ ±1 km
    city_lng := cities_lng[city_index] + (random() - 0.5) * 0.02; -- ±0.01 degré ≈ ±1 km
    
    -- Générer un numéro de rue aléatoire
    street_number := 1 + (random() * 99)::INTEGER;
    
    -- Sélectionner une rue aléatoire
    street_name := streets[1 + (random() * (array_length(streets, 1) - 1))::INTEGER];
    
    -- Construire l'adresse complète
    full_address := street_number::TEXT || ' ' || street_name || ', ' || city_name || ', France';
    
    -- Créer l'objet JSON pour address_home
    -- Structure: { "address": "...", "lat": ..., "lng": ... }
    address_home_json := jsonb_build_object(
      'address', full_address,
      'lat', city_lat,
      'lng', city_lng,
      'city', city_name,
      'postal_code', CASE city_index
        WHEN 1 THEN '59190'  -- Hazebrouck
        WHEN 2 THEN '62500'  -- Saint-Omer
        WHEN 3 THEN '59173'  -- Blaringhem
        WHEN 4 THEN '59173'  -- Ebblinghem
        WHEN 5 THEN '62510'  -- Arques
        WHEN 6 THEN '59173'  -- Renescure
        WHEN 7 THEN '62219'  -- Longuenesse
        ELSE '59190'
      END,
      'country', 'France'
    );
    
    -- Générer un rayon aléatoire entre 20, 30 ou 40 km (avec préférence équilibrée)
    rayon_value := CASE 
      WHEN random() < 0.33 THEN 20
      WHEN random() < 0.66 THEN 30
      ELSE 40
    END;
    
    -- Mettre à jour le profil avec l'adresse et le rayon
    UPDATE profiles p
    SET 
      address_home = address_home_json,
      rayon_km = rayon_value
    WHERE p.id = member_record.user_id;
    
    -- Afficher la progression tous les 10 membres
    IF current_member_count % 10 = 0 THEN
      RAISE NOTICE '   Progression: %/% membres traités...', current_member_count, members_count;
    END IF;
  END LOOP;
  
  -- Afficher le résumé final
  RAISE NOTICE '';
  RAISE NOTICE '✅ Terminé!';
  RAISE NOTICE '   👥 Membres traités: %', current_member_count;
  RAISE NOTICE '   📊 Répartition par ville:';
  
  -- Afficher la répartition par ville
  FOR city_index IN 1..array_length(cities, 1) LOOP
    RAISE NOTICE '      - %: % membres', 
      cities[city_index],
      (SELECT COUNT(*) 
       FROM profiles p
       JOIN group_members gm ON gm.user_id = p.id
       WHERE gm.group_id = test_group_id 
       AND (p.address_home->>'city') = cities[city_index]
      );
  END LOOP;
  
  RAISE NOTICE '   📊 Répartition par rayon:';
  RAISE NOTICE '      - 20 km: % membres', 
    (SELECT COUNT(*) FROM profiles p JOIN group_members gm ON gm.user_id = p.id WHERE gm.group_id = test_group_id AND p.rayon_km = 20);
  RAISE NOTICE '      - 30 km: % membres', 
    (SELECT COUNT(*) FROM profiles p JOIN group_members gm ON gm.user_id = p.id WHERE gm.group_id = test_group_id AND p.rayon_km = 30);
  RAISE NOTICE '      - 40 km: % membres', 
    (SELECT COUNT(*) FROM profiles p JOIN group_members gm ON gm.user_id = p.id WHERE gm.group_id = test_group_id AND p.rayon_km = 40);
END $$;

-- Vérifier les résultats
SELECT 
  p.display_name,
  p.address_home->>'city' as ville,
  p.address_home->>'address' as adresse,
  (p.address_home->>'lat')::DOUBLE PRECISION as latitude,
  (p.address_home->>'lng')::DOUBLE PRECISION as longitude,
  p.rayon_km
FROM profiles p
JOIN group_members gm ON gm.user_id = p.id
WHERE gm.group_id = (
  SELECT id FROM groups WHERE name = 'Groupe de test - 50+ membres' LIMIT 1
)
ORDER BY RANDOM()
LIMIT 20;

