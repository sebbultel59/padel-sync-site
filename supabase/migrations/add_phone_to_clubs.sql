-- Migration: Ajouter colonne phone à la table clubs
-- Date: 2025-11-03

ALTER TABLE clubs 
ADD COLUMN IF NOT EXISTS phone TEXT;

-- Ajouter un index pour faciliter les recherches si nécessaire
CREATE INDEX IF NOT EXISTS idx_clubs_phone ON clubs(phone) WHERE phone IS NOT NULL;

-- Commentaire pour documentation
COMMENT ON COLUMN clubs.phone IS 'Numéro de téléphone du club pour les réservations';
