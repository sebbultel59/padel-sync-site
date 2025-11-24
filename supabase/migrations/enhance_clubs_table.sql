-- Migration: Enrichissement de la table clubs
-- Date: 2025-11-23
-- Ajoute les champs nécessaires pour la gestion complète des clubs

-- 1. Ajouter logo_url
ALTER TABLE clubs 
  ADD COLUMN IF NOT EXISTS logo_url TEXT;

-- 2. Ajouter description
ALTER TABLE clubs 
  ADD COLUMN IF NOT EXISTS description TEXT;

-- 3. Ajouter social_links (JSONB pour stocker les liens sociaux)
ALTER TABLE clubs 
  ADD COLUMN IF NOT EXISTS social_links JSONB DEFAULT '{}'::jsonb;

-- 4. Ajouter les champs pour le bouton d'appel
ALTER TABLE clubs 
  ADD COLUMN IF NOT EXISTS call_button_enabled BOOLEAN DEFAULT true;

ALTER TABLE clubs 
  ADD COLUMN IF NOT EXISTS call_button_label TEXT;

ALTER TABLE clubs 
  ADD COLUMN IF NOT EXISTS call_phone TEXT;

-- 5. Créer des index si nécessaire
CREATE INDEX IF NOT EXISTS idx_clubs_call_button_enabled ON clubs(call_button_enabled) WHERE call_button_enabled = true;

-- 6. Commentaires pour documentation
COMMENT ON COLUMN clubs.logo_url IS 'URL du logo du club';
COMMENT ON COLUMN clubs.description IS 'Description du club';
COMMENT ON COLUMN clubs.social_links IS 'Liens sociaux du club (JSONB: {facebook, instagram, website, etc.})';
COMMENT ON COLUMN clubs.call_button_enabled IS 'Active ou désactive le bouton d''appel sur les matchs validés';
COMMENT ON COLUMN clubs.call_button_label IS 'Label du bouton d''appel (ex: "Appeler Padel Sync Hazebrouck")';
COMMENT ON COLUMN clubs.call_phone IS 'Numéro de téléphone du club (ex: +33321000000)';

