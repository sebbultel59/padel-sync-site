-- Migration: Création du système de badges joueurs pour Padel Sync
-- Date: 2025-12-03
-- Tables: badge_definitions, user_badges
-- Type enum: badge_category_enum

-- 1. Création du type enum pour les catégories de badges
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'badge_category_enum') THEN
    CREATE TYPE badge_category_enum AS ENUM ('volume', 'performance', 'social', 'club', 'bar', 'other');
  END IF;
END $$;

-- 2. Table badge_definitions (définitions des badges disponibles)
CREATE TABLE IF NOT EXISTS badge_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(100) NOT NULL UNIQUE,
  label VARCHAR(255) NOT NULL,
  description TEXT,
  category badge_category_enum NOT NULL DEFAULT 'other',
  is_manual BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Table user_badges (badges débloqués par les joueurs)
CREATE TABLE IF NOT EXISTS user_badges (
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  badge_id UUID NOT NULL REFERENCES badge_definitions(id) ON DELETE CASCADE,
  unlocked_at TIMESTAMPTZ DEFAULT NOW(),
  source_match_id UUID REFERENCES matches(id) ON DELETE SET NULL,
  granted_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  PRIMARY KEY (user_id, badge_id)
);

-- 4. Index pour améliorer les performances

-- Index pour badge_definitions
CREATE INDEX IF NOT EXISTS idx_badge_definitions_code ON badge_definitions(code);
CREATE INDEX IF NOT EXISTS idx_badge_definitions_category ON badge_definitions(category);
CREATE INDEX IF NOT EXISTS idx_badge_definitions_is_active ON badge_definitions(is_active);
CREATE INDEX IF NOT EXISTS idx_badge_definitions_is_manual ON badge_definitions(is_manual);

-- Index pour user_badges
CREATE INDEX IF NOT EXISTS idx_user_badges_user_id ON user_badges(user_id);
CREATE INDEX IF NOT EXISTS idx_user_badges_badge_id ON user_badges(badge_id);
CREATE INDEX IF NOT EXISTS idx_user_badges_unlocked_at ON user_badges(unlocked_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_badges_source_match_id ON user_badges(source_match_id);

-- 5. Trigger pour mettre à jour updated_at
CREATE OR REPLACE FUNCTION update_badge_definitions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_badge_definitions_updated_at ON badge_definitions;
CREATE TRIGGER trigger_update_badge_definitions_updated_at
  BEFORE UPDATE ON badge_definitions
  FOR EACH ROW
  EXECUTE FUNCTION update_badge_definitions_updated_at();

-- 6. Insertion des badges automatiques de base
-- A. Badges Volume
INSERT INTO badge_definitions (code, label, description, category, is_manual, is_active) VALUES
  ('VOLUME_5_MATCHES', '5 Matchs', 'A joué 5 matchs (tous types confondus)', 'volume', false, true),
  ('VOLUME_20_MATCHES', '20 Matchs', 'A joué 20 matchs (tous types confondus)', 'volume', false, true),
  ('VOLUME_50_MATCHES', '50 Matchs', 'A joué 50 matchs (tous types confondus)', 'volume', false, true),
  ('VOLUME_100_MATCHES', '100 Matchs', 'A joué 100 matchs (tous types confondus)', 'volume', false, true),
  ('RANKED_10_MATCHES', '10 Matchs Classés', 'A joué 10 matchs classés', 'volume', false, true),
  ('TOURNAMENT_5_MATCHES', '5 Matchs Tournoi', 'A joué 5 matchs en tournoi', 'volume', false, true)
ON CONFLICT (code) DO NOTHING;

-- B. Badges Performance
INSERT INTO badge_definitions (code, label, description, category, is_manual, is_active) VALUES
  ('STREAK_3_WINS', 'Série de 3 Victoires', '3 victoires consécutives', 'performance', false, true),
  ('STREAK_5_WINS', 'Série de 5 Victoires', '5 victoires consécutives', 'performance', false, true),
  ('STREAK_10_WINS', 'Série de 10 Victoires', '10 victoires consécutives', 'performance', false, true),
  ('UPSET_15_RATING', 'Upset +15', 'Victoire contre une équipe avec un rating moyen supérieur d''au moins 15 points', 'performance', false, true)
ON CONFLICT (code) DO NOTHING;

-- C. Badges Social
INSERT INTO badge_definitions (code, label, description, category, is_manual, is_active) VALUES
  ('SOCIAL_5_PARTNERS', '5 Partenaires', 'A joué avec 5 partenaires différents', 'social', false, true),
  ('SOCIAL_10_PARTNERS', '10 Partenaires', 'A joué avec 10 partenaires différents', 'social', false, true),
  ('SOCIAL_20_PARTNERS', '20 Partenaires', 'A joué avec 20 partenaires différents', 'social', false, true),
  ('CAMELEON', 'Caméléon', 'Aucun partenaire n''a représenté plus de 20% des matchs sur les 30 derniers jours', 'social', false, true)
ON CONFLICT (code) DO NOTHING;

-- D. Badge Club (manuel)
INSERT INTO badge_definitions (code, label, description, category, is_manual, is_active) VALUES
  ('AFTER_MATCH_CLUB', 'Après-Match au Club', 'Badge débloqué manuellement par un admin club', 'bar', true, true)
ON CONFLICT (code) DO NOTHING;

-- 7. Commentaires pour documentation
COMMENT ON TABLE badge_definitions IS 'Définitions des badges disponibles dans le système';
COMMENT ON COLUMN badge_definitions.code IS 'Code unique du badge (ex: VOLUME_5_MATCHES)';
COMMENT ON COLUMN badge_definitions.label IS 'Libellé affiché du badge';
COMMENT ON COLUMN badge_definitions.description IS 'Description détaillée du badge';
COMMENT ON COLUMN badge_definitions.category IS 'Catégorie du badge: volume, performance, social, club, bar, other';
COMMENT ON COLUMN badge_definitions.is_manual IS 'true si le badge est assigné manuellement, false si calculé automatiquement';
COMMENT ON COLUMN badge_definitions.is_active IS 'true si le badge est actif et peut être débloqué';

COMMENT ON TABLE user_badges IS 'Badges débloqués par les joueurs';
COMMENT ON COLUMN user_badges.source_match_id IS 'ID du match qui a déclenché le déblocage (pour badges automatiques)';
COMMENT ON COLUMN user_badges.granted_by IS 'ID de l''utilisateur qui a accordé le badge (pour badges manuels)';

COMMENT ON TYPE badge_category_enum IS 'Catégories de badges: volume (nombre de matchs), performance (séries, upsets), social (partenaires), club (badges club), bar (convivialité), other (autres)';

-- 8. RLS (Row Level Security)
ALTER TABLE badge_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_badges ENABLE ROW LEVEL SECURITY;

-- 9. Politiques RLS pour badge_definitions
-- Tout le monde peut voir les définitions de badges
DROP POLICY IF EXISTS "Anyone can view badge definitions" ON badge_definitions;
CREATE POLICY "Anyone can view badge definitions"
  ON badge_definitions
  FOR SELECT
  USING (true);

-- Seuls les admins peuvent modifier les définitions
DROP POLICY IF EXISTS "Admins can manage badge definitions" ON badge_definitions;
CREATE POLICY "Admins can manage badge definitions"
  ON badge_definitions
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'super_admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'super_admin')
    )
  );

-- 10. Politiques RLS pour user_badges
-- Tout le monde peut voir les badges des joueurs
DROP POLICY IF EXISTS "Anyone can view user badges" ON user_badges;
CREATE POLICY "Anyone can view user badges"
  ON user_badges
  FOR SELECT
  USING (true);

-- Les joueurs peuvent voir leurs propres badges
-- Les admins peuvent gérer tous les badges
DROP POLICY IF EXISTS "Users and admins can manage badges" ON user_badges;
CREATE POLICY "Users and admins can manage badges"
  ON user_badges
  FOR ALL
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'super_admin')
    )
  )
  WITH CHECK (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'super_admin')
    )
  );


