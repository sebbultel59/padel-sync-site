-- Migration: Correction de la contrainte profiles_cote_check pour accepter "les_deux"
-- Date: 2025-01-XX

-- Supprimer l'ancienne contrainte si elle existe
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_cote_check;

-- Ajouter la nouvelle contrainte qui accepte "droite", "gauche" et "les_deux"
ALTER TABLE profiles ADD CONSTRAINT profiles_cote_check 
  CHECK (cote IS NULL OR cote IN ('droite', 'gauche', 'les_deux'));

