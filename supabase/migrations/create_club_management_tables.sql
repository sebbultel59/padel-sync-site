-- Migration: Création des tables de gestion de club
-- Date: 2025-11-23
-- Tables pour les posts et notifications des clubs

-- 1. Table club_posts (actus du club)
CREATE TABLE IF NOT EXISTS club_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT,
  image_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID NOT NULL REFERENCES profiles(id) ON DELETE SET NULL
);

-- 2. Table club_notifications (notifications envoyées aux membres des groupes du club)
CREATE TABLE IF NOT EXISTS club_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID NOT NULL REFERENCES profiles(id) ON DELETE SET NULL
);

-- 3. Index pour améliorer les performances
CREATE INDEX IF NOT EXISTS idx_club_posts_club_id ON club_posts(club_id);
CREATE INDEX IF NOT EXISTS idx_club_posts_created_at ON club_posts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_club_notifications_club_id ON club_notifications(club_id);
CREATE INDEX IF NOT EXISTS idx_club_notifications_created_at ON club_notifications(created_at DESC);

-- 4. Commentaires pour documentation
COMMENT ON TABLE club_posts IS 'Posts/actus publiés par les club_managers pour leur club';
COMMENT ON TABLE club_notifications IS 'Notifications envoyées aux membres des groupes d''un club';

-- 5. RLS (Row Level Security)
ALTER TABLE club_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE club_notifications ENABLE ROW LEVEL SECURITY;

-- 6. Politiques RLS pour club_posts
-- Tout le monde peut voir les posts publics
DROP POLICY IF EXISTS "Anyone can view club posts" ON club_posts;
CREATE POLICY "Anyone can view club posts"
  ON club_posts
  FOR SELECT
  USING (true);

-- Seuls les club_managers du club peuvent créer des posts
DROP POLICY IF EXISTS "Club managers can create posts" ON club_posts;
CREATE POLICY "Club managers can create posts"
  ON club_posts
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'club_manager'
      AND profiles.club_id = club_posts.club_id
    )
  );

-- Seuls les club_managers du club peuvent modifier leurs posts
DROP POLICY IF EXISTS "Club managers can update their posts" ON club_posts;
CREATE POLICY "Club managers can update their posts"
  ON club_posts
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'club_manager'
      AND profiles.club_id = club_posts.club_id
    )
  );

-- Seuls les club_managers du club peuvent supprimer leurs posts
DROP POLICY IF EXISTS "Club managers can delete their posts" ON club_posts;
CREATE POLICY "Club managers can delete their posts"
  ON club_posts
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'club_manager'
      AND profiles.club_id = club_posts.club_id
    )
  );

-- 7. Politiques RLS pour club_notifications
-- Tout le monde peut voir les notifications (pour les membres des groupes)
DROP POLICY IF EXISTS "Anyone can view club notifications" ON club_notifications;
CREATE POLICY "Anyone can view club notifications"
  ON club_notifications
  FOR SELECT
  USING (true);

-- Seuls les club_managers du club peuvent créer des notifications
DROP POLICY IF EXISTS "Club managers can create notifications" ON club_notifications;
CREATE POLICY "Club managers can create notifications"
  ON club_notifications
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'club_manager'
      AND profiles.club_id = club_notifications.club_id
    )
  );

-- Les notifications ne peuvent pas être modifiées après création
-- Les super_admins peuvent supprimer les notifications
DROP POLICY IF EXISTS "Super admins can delete notifications" ON club_notifications;
CREATE POLICY "Super admins can delete notifications"
  ON club_notifications
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'super_admin'
    )
  );

