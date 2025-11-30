-- Script SQL à exécuter dans Supabase Dashboard → SQL Editor
-- Crée la table club_events et toutes les dépendances nécessaires
-- Date: 2025-01-XX
-- Version robuste qui gère les cas où la table existe déjà

-- 1. Vérifier si la table existe et a la bonne structure
DO $$
BEGIN
  -- Si la table existe mais n'a pas la colonne date_start, la supprimer et la recréer
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'club_events'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'club_events' 
    AND column_name = 'date_start'
  ) THEN
    -- Supprimer la table existante avec mauvaise structure
    DROP TABLE IF EXISTS club_events CASCADE;
    RAISE NOTICE 'Table club_events supprimée (structure incorrecte)';
  END IF;
END $$;

-- 2. Créer la table club_events si elle n'existe pas
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

-- 3. Créer les index si ils n'existent pas (seulement si la table a la bonne structure)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'club_events' 
    AND column_name = 'date_start'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_club_events_club_id ON club_events(club_id);
    CREATE INDEX IF NOT EXISTS idx_club_events_date_start ON club_events(date_start);
    CREATE INDEX IF NOT EXISTS idx_club_events_category ON club_events(category);
    CREATE INDEX IF NOT EXISTS idx_club_events_club_date ON club_events(club_id, date_start);
    RAISE NOTICE 'Index créés';
  END IF;
END $$;

-- 4. Créer la fonction pour updated_at si elle n'existe pas
CREATE OR REPLACE FUNCTION update_club_events_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 5. Créer le trigger si il n'existe pas (seulement si la table existe)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'club_events'
  ) THEN
    DROP TRIGGER IF EXISTS trigger_update_club_events_updated_at ON club_events;
    CREATE TRIGGER trigger_update_club_events_updated_at
      BEFORE UPDATE ON club_events
      FOR EACH ROW
      EXECUTE FUNCTION update_club_events_updated_at();
    RAISE NOTICE 'Trigger créé';
  END IF;
END $$;

-- 6. Activer RLS (seulement si la table existe)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'club_events'
  ) THEN
    ALTER TABLE club_events ENABLE ROW LEVEL SECURITY;
    RAISE NOTICE 'RLS activé';
  END IF;
END $$;

-- 7. Supprimer les politiques existantes (pour éviter les doublons)
DROP POLICY IF EXISTS "Anyone can view club events" ON club_events;
DROP POLICY IF EXISTS "Club managers can create events" ON club_events;
DROP POLICY IF EXISTS "Club managers can update their events" ON club_events;
DROP POLICY IF EXISTS "Club managers can delete their events" ON club_events;

-- 8. Créer les politiques RLS (seulement si la table existe avec la bonne structure)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'club_events' 
    AND column_name = 'date_start'
  ) THEN
    -- Tout le monde peut voir les événements publics
    CREATE POLICY "Anyone can view club events"
      ON club_events
      FOR SELECT
      USING (true);

    -- Seuls les club_managers du club peuvent créer des événements
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
    
    RAISE NOTICE 'Politiques RLS créées';
  END IF;
END $$;

-- 9. Ajouter les commentaires (seulement si la table existe)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'club_events' 
    AND column_name = 'date_start'
  ) THEN
    COMMENT ON TABLE club_events IS 'Événements de l''agenda du club (tournois, stages, fermetures, etc.)';
    COMMENT ON COLUMN club_events.category IS 'Catégorie: sport (tournois, stages), social (soirées, BBQ), kids (école de padel), info (fermetures, travaux)';
    COMMENT ON COLUMN club_events.date_start IS 'Date et heure de début de l''événement';
    COMMENT ON COLUMN club_events.date_end IS 'Date et heure de fin (optionnel, si null = événement ponctuel)';
    RAISE NOTICE 'Commentaires ajoutés';
  END IF;
END $$;

-- 10. Vérification finale
SELECT 
  'Table club_events créée avec succès!' as message,
  COUNT(*) as nombre_colonnes
FROM information_schema.columns 
WHERE table_schema = 'public'
AND table_name = 'club_events';

-- Afficher la structure de la table
SELECT 
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns 
WHERE table_schema = 'public'
AND table_name = 'club_events'
ORDER BY ordinal_position;
