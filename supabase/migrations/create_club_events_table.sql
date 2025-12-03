-- Migration: Création de la table club_events
-- Date: 2025-01-XX
-- Table pour l'agenda des événements des clubs

-- 1. Table club_events (agenda du club)
CREATE TABLE IF NOT EXISTS club_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL CHECK (category IN ('sport', 'social', 'kids', 'info')),
  date_start TIMESTAMPTZ NOT NULL,
  date_end TIMESTAMPTZ,
  image_url TEXT,
  location TEXT,
  created_by UUID NOT NULL REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Index pour améliorer les performances
CREATE INDEX IF NOT EXISTS idx_club_events_club_id ON club_events(club_id);
CREATE INDEX IF NOT EXISTS idx_club_events_date_start ON club_events(date_start);
CREATE INDEX IF NOT EXISTS idx_club_events_category ON club_events(category);
CREATE INDEX IF NOT EXISTS idx_club_events_club_date ON club_events(club_id, date_start);

-- 3. Commentaires pour documentation
COMMENT ON TABLE club_events IS 'Événements de l''agenda du club (tournois, stages, fermetures, etc.)';
COMMENT ON COLUMN club_events.category IS 'Catégorie: sport (tournois, stages), social (soirées, BBQ), kids (école de padel), info (fermetures, travaux)';
COMMENT ON COLUMN club_events.date_start IS 'Date et heure de début de l''événement';
COMMENT ON COLUMN club_events.date_end IS 'Date et heure de fin (optionnel, si null = événement ponctuel)';

-- 4. Trigger pour mettre à jour updated_at
CREATE OR REPLACE FUNCTION update_club_events_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_club_events_updated_at ON club_events;
CREATE TRIGGER trigger_update_club_events_updated_at
  BEFORE UPDATE ON club_events
  FOR EACH ROW
  EXECUTE FUNCTION update_club_events_updated_at();

-- 5. RLS (Row Level Security)
ALTER TABLE club_events ENABLE ROW LEVEL SECURITY;

-- 6. Politiques RLS pour club_events
-- Tout le monde peut voir les événements publics
DROP POLICY IF EXISTS "Anyone can view club events" ON club_events;
CREATE POLICY "Anyone can view club events"
  ON club_events
  FOR SELECT
  USING (true);

-- Seuls les club_managers du club peuvent créer des événements
DROP POLICY IF EXISTS "Club managers can create events" ON club_events;
CREATE POLICY "Club managers can create events"
  ON club_events
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'club_manager'
      AND profiles.club_id = club_events.club_id
    )
  );

-- Seuls les club_managers du club peuvent modifier leurs événements
DROP POLICY IF EXISTS "Club managers can update their events" ON club_events;
CREATE POLICY "Club managers can update their events"
  ON club_events
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'club_manager'
      AND profiles.club_id = club_events.club_id
    )
  );

-- Seuls les club_managers du club peuvent supprimer leurs événements
DROP POLICY IF EXISTS "Club managers can delete their events" ON club_events;
CREATE POLICY "Club managers can delete their events"
  ON club_events
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'club_manager'
      AND profiles.club_id = club_events.club_id
    )
  );




