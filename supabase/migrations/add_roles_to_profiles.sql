-- Migration: Ajout des colonnes de rôles à la table profiles
-- Date: 2025-11-23
-- Ajoute le système de rôles structuré : player, admin, club_manager, super_admin

-- 1. Ajouter la colonne role avec contrainte CHECK
ALTER TABLE profiles 
  ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'player' 
  CHECK (role IN ('player', 'admin', 'club_manager', 'super_admin'));

-- 2. Ajouter la colonne club_id (nullable, pour les club_managers)
ALTER TABLE profiles 
  ADD COLUMN IF NOT EXISTS club_id UUID REFERENCES clubs(id) ON DELETE SET NULL;

-- 3. Créer des index pour améliorer les performances
CREATE INDEX IF NOT EXISTS idx_profiles_role ON profiles(role) WHERE role IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_profiles_club_id ON profiles(club_id) WHERE club_id IS NOT NULL;

-- 4. Migration des données existantes
-- Migrer super_admins → super_admin
UPDATE profiles
SET role = 'super_admin'
WHERE id IN (
  SELECT user_id FROM super_admins
)
AND (role IS NULL OR role = 'player');

-- Migrer admins → admin
UPDATE profiles
SET role = 'admin'
WHERE id IN (
  SELECT user_id FROM admins
)
AND (role IS NULL OR role = 'player');

-- 5. S'assurer que tous les profils ont un rôle (par défaut 'player')
UPDATE profiles
SET role = 'player'
WHERE role IS NULL;

-- 6. Commentaires pour documentation
COMMENT ON COLUMN profiles.role IS 'Rôle de l''utilisateur : player (par défaut), admin, club_manager, super_admin';
COMMENT ON COLUMN profiles.club_id IS 'ID du club géré par l''utilisateur (uniquement pour les club_managers)';

