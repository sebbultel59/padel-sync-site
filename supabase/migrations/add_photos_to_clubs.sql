-- Migration: Ajouter colonne photos à la table clubs
-- Date: 2025-11-24
-- Permet de stocker un tableau d'URLs de photos du club

ALTER TABLE clubs 
  ADD COLUMN IF NOT EXISTS photos JSONB DEFAULT '[]'::jsonb;

-- Commentaire pour documentation
COMMENT ON COLUMN clubs.photos IS 'Tableau JSONB d''URLs de photos du club (max 5 photos)';

