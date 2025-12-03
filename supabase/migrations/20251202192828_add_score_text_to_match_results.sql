-- Migration: Ajout de la colonne score_text à match_results
-- Date: 2025-12-02

ALTER TABLE match_results 
ADD COLUMN IF NOT EXISTS score_text TEXT;

COMMENT ON COLUMN match_results.score_text IS 'Score détaillé par set (ex: "6-4, 6-3" ou "6-4, 3-6, 6-2")';
