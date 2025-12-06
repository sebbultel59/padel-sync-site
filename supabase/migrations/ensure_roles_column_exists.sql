-- Migration: Vérification et création de la colonne role si elle n'existe pas
-- Date: 2025-11-23
-- Cette migration s'assure que la colonne role existe avant que l'app ne démarre

-- 1. Vérifier et créer la colonne role si elle n'existe pas
DO $$
BEGIN
  -- Vérifier si la colonne role existe
  IF NOT EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'profiles' 
    AND column_name = 'role'
  ) THEN
    -- Créer la colonne role avec valeur par défaut
    ALTER TABLE profiles 
      ADD COLUMN role TEXT DEFAULT 'player' 
      CHECK (role IN ('player', 'admin', 'club_manager', 'super_admin'));
    
    -- Mettre à jour tous les profils existants qui n'ont pas de rôle
    UPDATE profiles
    SET role = 'player'
    WHERE role IS NULL;
    
    RAISE NOTICE 'Colonne role créée dans profiles';
  ELSE
    RAISE NOTICE 'Colonne role existe déjà dans profiles';
  END IF;
END $$;

-- 2. Vérifier et créer la colonne club_id si elle n'existe pas
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'profiles' 
    AND column_name = 'club_id'
  ) THEN
    -- Créer la colonne club_id
    ALTER TABLE profiles 
      ADD COLUMN club_id UUID REFERENCES clubs(id) ON DELETE SET NULL;
    
    RAISE NOTICE 'Colonne club_id créée dans profiles';
  ELSE
    RAISE NOTICE 'Colonne club_id existe déjà dans profiles';
  END IF;
END $$;

-- 3. Créer les index si ils n'existent pas
CREATE INDEX IF NOT EXISTS idx_profiles_role ON profiles(role) WHERE role IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_profiles_club_id ON profiles(club_id) WHERE club_id IS NOT NULL;

-- 4. Migration des données existantes (si les tables super_admins et admins existent)
DO $$
BEGIN
  -- Migrer super_admins → super_admin (seulement si la table existe)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'super_admins') THEN
    UPDATE profiles
    SET role = 'super_admin'
    WHERE id IN (
      SELECT user_id FROM super_admins
    )
    AND (role IS NULL OR role = 'player');
    
    RAISE NOTICE 'Données super_admins migrées';
  END IF;
  
  -- Migrer admins → admin (seulement si la table existe)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'admins') THEN
    UPDATE profiles
    SET role = 'admin'
    WHERE id IN (
      SELECT user_id FROM admins
    )
    AND (role IS NULL OR role = 'player');
    
    RAISE NOTICE 'Données admins migrées';
  END IF;
END $$;

-- 5. S'assurer que tous les profils ont un rôle
UPDATE profiles
SET role = 'player'
WHERE role IS NULL;

-- 6. Commentaires pour documentation
COMMENT ON COLUMN profiles.role IS 'Rôle de l''utilisateur : player (par défaut), admin, club_manager, super_admin';
COMMENT ON COLUMN profiles.club_id IS 'ID du club géré par l''utilisateur (uniquement pour les club_managers)';











