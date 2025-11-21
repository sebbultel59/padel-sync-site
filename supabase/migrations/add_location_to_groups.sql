-- Migration: Ajouter les colonnes de localisation à la table groups
-- Date: 2025-01-XX
-- Permet d'associer un club support ou une ville à un groupe

-- Ajouter la colonne club_id (référence vers clubs)
ALTER TABLE groups 
  ADD COLUMN IF NOT EXISTS club_id UUID REFERENCES clubs(id) ON DELETE SET NULL;

-- Ajouter la colonne city (ville)
ALTER TABLE groups 
  ADD COLUMN IF NOT EXISTS city TEXT;

-- Créer des index pour améliorer les performances de recherche
CREATE INDEX IF NOT EXISTS idx_groups_club_id ON groups(club_id) WHERE club_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_groups_city ON groups(city) WHERE city IS NOT NULL;

-- Commentaires pour documentation
COMMENT ON COLUMN groups.club_id IS 'Club support associé au groupe (facultatif)';
COMMENT ON COLUMN groups.city IS 'Ville associée au groupe (facultatif)';

