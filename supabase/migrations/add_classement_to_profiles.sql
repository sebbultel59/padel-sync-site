-- Migration: Ajout de la colonne classement à la table profiles
-- Date: 2025-01-XX

-- Ajouter la colonne classement (facultative, type TEXT)
ALTER TABLE profiles 
  ADD COLUMN IF NOT EXISTS classement TEXT;

