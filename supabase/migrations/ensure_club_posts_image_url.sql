-- Migration: S'assurer que la colonne image_url existe dans club_posts
-- Date: 2025-11-23
-- Vérifie et crée la colonne image_url si elle n'existe pas

-- Ajouter la colonne image_url si elle n'existe pas
ALTER TABLE club_posts 
  ADD COLUMN IF NOT EXISTS image_url TEXT;

-- Commentaire pour documentation
COMMENT ON COLUMN club_posts.image_url IS 'URL de l''image associée au post';

