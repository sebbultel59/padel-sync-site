-- Migration: Activer RLS sur les tables publiques sans sécurité
-- Date: 2025-01-03
-- Corrige les erreurs de sécurité détectées par le linter Supabase
-- 
-- Tables concernées:
-- - clubs (CRITIQUE: accessible depuis l'app client)
-- - admins (sensible)
-- - instagram_tokens (sensible: contient des tokens d'accès)
-- - availability_global (utilisée via RPC mais doit avoir RLS)
-- - availability_thresholds_sent (interne)
-- - notification_outbox, push_outbox, event_outbox, outbox_events (tables internes Edge Functions)

-- ============================================================================
-- 1. TABLE CLUBS (CRITIQUE)
-- ============================================================================
-- Lecture publique (tous les utilisateurs peuvent voir les clubs)
-- Écriture restreinte aux club_managers et super_admins

ALTER TABLE clubs ENABLE ROW LEVEL SECURITY;

-- Politique SELECT: Tout le monde peut lire les clubs (nécessaire pour l'app)
DROP POLICY IF EXISTS "Anyone can view clubs" ON clubs;
CREATE POLICY "Anyone can view clubs"
  ON clubs
  FOR SELECT
  USING (true);

-- Politique INSERT: Seuls les super_admins peuvent créer des clubs
DROP POLICY IF EXISTS "Super admins can create clubs" ON clubs;
CREATE POLICY "Super admins can create clubs"
  ON clubs
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'super_admin'
    )
  );

-- Politique UPDATE: Les club_managers peuvent modifier leur club, les super_admins peuvent tout modifier
DROP POLICY IF EXISTS "Club managers and super admins can update clubs" ON clubs;
CREATE POLICY "Club managers and super admins can update clubs"
  ON clubs
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND (
        profiles.role = 'super_admin'
        OR (
          profiles.role = 'club_manager'
          AND profiles.club_id = clubs.id
        )
      )
    )
  );

-- Politique DELETE: Seuls les super_admins peuvent supprimer des clubs
DROP POLICY IF EXISTS "Super admins can delete clubs" ON clubs;
CREATE POLICY "Super admins can delete clubs"
  ON clubs
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'super_admin'
    )
  );

-- ============================================================================
-- 2. TABLE ADMINS (SENSIBLE)
-- ============================================================================
-- Accès très restrictif: seulement super_admins

ALTER TABLE admins ENABLE ROW LEVEL SECURITY;

-- Politique SELECT: Seuls les super_admins peuvent voir les admins
DROP POLICY IF EXISTS "Super admins can view admins" ON admins;
CREATE POLICY "Super admins can view admins"
  ON admins
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'super_admin'
    )
  );

-- Politique INSERT: Seuls les super_admins peuvent créer des admins
DROP POLICY IF EXISTS "Super admins can create admins" ON admins;
CREATE POLICY "Super admins can create admins"
  ON admins
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'super_admin'
    )
  );

-- Politique UPDATE: Seuls les super_admins peuvent modifier les admins
DROP POLICY IF EXISTS "Super admins can update admins" ON admins;
CREATE POLICY "Super admins can update admins"
  ON admins
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'super_admin'
    )
  );

-- Politique DELETE: Seuls les super_admins peuvent supprimer des admins
DROP POLICY IF EXISTS "Super admins can delete admins" ON admins;
CREATE POLICY "Super admins can delete admins"
  ON admins
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'super_admin'
    )
  );

-- ============================================================================
-- 3. TABLE INSTAGRAM_TOKENS (SENSIBLE: contient des tokens d'accès)
-- ============================================================================
-- Accès restreint: club_managers de leur club et super_admins

ALTER TABLE instagram_tokens ENABLE ROW LEVEL SECURITY;

-- Politique SELECT: Les club_managers peuvent voir le token de leur club, les super_admins peuvent tout voir
DROP POLICY IF EXISTS "Club managers and super admins can view instagram tokens" ON instagram_tokens;
CREATE POLICY "Club managers and super admins can view instagram tokens"
  ON instagram_tokens
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND (
        profiles.role = 'super_admin'
        OR (
          profiles.role = 'club_manager'
          AND profiles.club_id = instagram_tokens.club_id
        )
      )
    )
  );

-- Politique INSERT: Les club_managers peuvent créer un token pour leur club, les super_admins peuvent tout créer
DROP POLICY IF EXISTS "Club managers and super admins can create instagram tokens" ON instagram_tokens;
CREATE POLICY "Club managers and super admins can create instagram tokens"
  ON instagram_tokens
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND (
        profiles.role = 'super_admin'
        OR (
          profiles.role = 'club_manager'
          AND profiles.club_id = instagram_tokens.club_id
        )
      )
    )
  );

-- Politique UPDATE: Les club_managers peuvent modifier le token de leur club, les super_admins peuvent tout modifier
DROP POLICY IF EXISTS "Club managers and super admins can update instagram tokens" ON instagram_tokens;
CREATE POLICY "Club managers and super admins can update instagram tokens"
  ON instagram_tokens
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND (
        profiles.role = 'super_admin'
        OR (
          profiles.role = 'club_manager'
          AND profiles.club_id = instagram_tokens.club_id
        )
      )
    )
  );

-- Politique DELETE: Les club_managers peuvent supprimer le token de leur club, les super_admins peuvent tout supprimer
DROP POLICY IF EXISTS "Club managers and super admins can delete instagram tokens" ON instagram_tokens;
CREATE POLICY "Club managers and super admins can delete instagram tokens"
  ON instagram_tokens
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND (
        profiles.role = 'super_admin'
        OR (
          profiles.role = 'club_manager'
          AND profiles.club_id = instagram_tokens.club_id
        )
      )
    )
  );

-- ============================================================================
-- 4. TABLE AVAILABILITY_GLOBAL
-- ============================================================================
-- Les utilisateurs peuvent gérer leurs propres disponibilités globales
-- Utilisée via RPC mais doit avoir RLS pour sécurité

ALTER TABLE availability_global ENABLE ROW LEVEL SECURITY;

-- Politique SELECT: Les utilisateurs peuvent voir leurs propres disponibilités globales
DROP POLICY IF EXISTS "Users can view their own global availability" ON availability_global;
CREATE POLICY "Users can view their own global availability"
  ON availability_global
  FOR SELECT
  USING (user_id = auth.uid());

-- Politique INSERT: Les utilisateurs peuvent créer leurs propres disponibilités globales
DROP POLICY IF EXISTS "Users can create their own global availability" ON availability_global;
CREATE POLICY "Users can create their own global availability"
  ON availability_global
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- Politique UPDATE: Les utilisateurs peuvent modifier leurs propres disponibilités globales
DROP POLICY IF EXISTS "Users can update their own global availability" ON availability_global;
CREATE POLICY "Users can update their own global availability"
  ON availability_global
  FOR UPDATE
  USING (user_id = auth.uid());

-- Politique DELETE: Les utilisateurs peuvent supprimer leurs propres disponibilités globales
DROP POLICY IF EXISTS "Users can delete their own global availability" ON availability_global;
CREATE POLICY "Users can delete their own global availability"
  ON availability_global
  FOR DELETE
  USING (user_id = auth.uid());

-- ============================================================================
-- 5. TABLE AVAILABILITY_THRESHOLDS_SENT
-- ============================================================================
-- Table interne pour le suivi des notifications de seuils
-- Accès restreint: seulement service_role (via Edge Functions)

ALTER TABLE availability_thresholds_sent ENABLE ROW LEVEL SECURITY;

-- Politique SELECT: Seuls les utilisateurs authentifiés peuvent voir leurs propres enregistrements
-- (si la table a une colonne user_id)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'availability_thresholds_sent' 
    AND column_name = 'user_id'
  ) THEN
    DROP POLICY IF EXISTS "Users can view their own threshold notifications" ON availability_thresholds_sent;
    CREATE POLICY "Users can view their own threshold notifications"
      ON availability_thresholds_sent
      FOR SELECT
      USING (user_id = auth.uid());
  ELSE
    -- Si pas de colonne user_id, bloquer tout accès utilisateur (seulement service_role)
    DROP POLICY IF EXISTS "No user access to threshold notifications" ON availability_thresholds_sent;
    CREATE POLICY "No user access to threshold notifications"
      ON availability_thresholds_sent
      FOR SELECT
      USING (false);
  END IF;
END $$;

-- Politiques INSERT/UPDATE/DELETE: Seulement service_role (pas d'accès utilisateur)
DROP POLICY IF EXISTS "No user insert to threshold notifications" ON availability_thresholds_sent;
CREATE POLICY "No user insert to threshold notifications"
  ON availability_thresholds_sent
  FOR INSERT
  WITH CHECK (false);

DROP POLICY IF EXISTS "No user update to threshold notifications" ON availability_thresholds_sent;
CREATE POLICY "No user update to threshold notifications"
  ON availability_thresholds_sent
  FOR UPDATE
  USING (false);

DROP POLICY IF EXISTS "No user delete to threshold notifications" ON availability_thresholds_sent;
CREATE POLICY "No user delete to threshold notifications"
  ON availability_thresholds_sent
  FOR DELETE
  USING (false);

-- ============================================================================
-- 6. TABLES OUTBOX (notification_outbox, push_outbox, event_outbox, outbox_events)
-- ============================================================================
-- Tables internes utilisées uniquement par Edge Functions avec SERVICE_ROLE_KEY
-- Blocage complet de l'accès utilisateur (seulement service_role)

-- 6.1 notification_outbox
ALTER TABLE notification_outbox ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "No user access to notification_outbox" ON notification_outbox;
CREATE POLICY "No user access to notification_outbox"
  ON notification_outbox
  FOR SELECT
  USING (false);

DROP POLICY IF EXISTS "No user insert to notification_outbox" ON notification_outbox;
CREATE POLICY "No user insert to notification_outbox"
  ON notification_outbox
  FOR INSERT
  WITH CHECK (false);

DROP POLICY IF EXISTS "No user update to notification_outbox" ON notification_outbox;
CREATE POLICY "No user update to notification_outbox"
  ON notification_outbox
  FOR UPDATE
  USING (false);

DROP POLICY IF EXISTS "No user delete to notification_outbox" ON notification_outbox;
CREATE POLICY "No user delete to notification_outbox"
  ON notification_outbox
  FOR DELETE
  USING (false);

-- 6.2 push_outbox
ALTER TABLE push_outbox ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "No user access to push_outbox" ON push_outbox;
CREATE POLICY "No user access to push_outbox"
  ON push_outbox
  FOR SELECT
  USING (false);

DROP POLICY IF EXISTS "No user insert to push_outbox" ON push_outbox;
CREATE POLICY "No user insert to push_outbox"
  ON push_outbox
  FOR INSERT
  WITH CHECK (false);

DROP POLICY IF EXISTS "No user update to push_outbox" ON push_outbox;
CREATE POLICY "No user update to push_outbox"
  ON push_outbox
  FOR UPDATE
  USING (false);

DROP POLICY IF EXISTS "No user delete to push_outbox" ON push_outbox;
CREATE POLICY "No user delete to push_outbox"
  ON push_outbox
  FOR DELETE
  USING (false);

-- 6.3 event_outbox
ALTER TABLE event_outbox ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "No user access to event_outbox" ON event_outbox;
CREATE POLICY "No user access to event_outbox"
  ON event_outbox
  FOR SELECT
  USING (false);

DROP POLICY IF EXISTS "No user insert to event_outbox" ON event_outbox;
CREATE POLICY "No user insert to event_outbox"
  ON event_outbox
  FOR INSERT
  WITH CHECK (false);

DROP POLICY IF EXISTS "No user update to event_outbox" ON event_outbox;
CREATE POLICY "No user update to event_outbox"
  ON event_outbox
  FOR UPDATE
  USING (false);

DROP POLICY IF EXISTS "No user delete to event_outbox" ON event_outbox;
CREATE POLICY "No user delete to event_outbox"
  ON event_outbox
  FOR DELETE
  USING (false);

-- 6.4 outbox_events
ALTER TABLE outbox_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "No user access to outbox_events" ON outbox_events;
CREATE POLICY "No user access to outbox_events"
  ON outbox_events
  FOR SELECT
  USING (false);

DROP POLICY IF EXISTS "No user insert to outbox_events" ON outbox_events;
CREATE POLICY "No user insert to outbox_events"
  ON outbox_events
  FOR INSERT
  WITH CHECK (false);

DROP POLICY IF EXISTS "No user update to outbox_events" ON outbox_events;
CREATE POLICY "No user update to outbox_events"
  ON outbox_events
  FOR UPDATE
  USING (false);

DROP POLICY IF EXISTS "No user delete to outbox_events" ON outbox_events;
CREATE POLICY "No user delete to outbox_events"
  ON outbox_events
  FOR DELETE
  USING (false);

-- ============================================================================
-- COMMENTAIRES
-- ============================================================================
COMMENT ON POLICY "Anyone can view clubs" ON clubs IS 'Permet à tous les utilisateurs de lire les clubs (nécessaire pour l''application)';
COMMENT ON POLICY "Super admins can create clubs" ON clubs IS 'Seuls les super_admins peuvent créer des clubs';
COMMENT ON POLICY "Club managers and super admins can update clubs" ON clubs IS 'Les club_managers peuvent modifier leur club, les super_admins peuvent tout modifier';
COMMENT ON POLICY "Super admins can delete clubs" ON clubs IS 'Seuls les super_admins peuvent supprimer des clubs';

COMMENT ON POLICY "Super admins can view admins" ON admins IS 'Seuls les super_admins peuvent voir la table admins';
COMMENT ON POLICY "Club managers and super admins can view instagram tokens" ON instagram_tokens IS 'Les club_managers peuvent voir le token de leur club, les super_admins peuvent tout voir';
COMMENT ON POLICY "Users can view their own global availability" ON availability_global IS 'Les utilisateurs peuvent voir leurs propres disponibilités globales';

