-- Migration: Corriger toutes les contraintes de clé étrangère qui référencent profiles
-- Date: 2025-01-XX
-- Description: Ajoute ON DELETE SET NULL ou CASCADE pour permettre la suppression de profils

-- ============================================================================
-- 1. VÉRIFIER TOUTES LES CONTRAINTES QUI RÉFÉRENCENT PROFILES
-- ============================================================================
SELECT 
  conname as constraint_name,
  conrelid::regclass as table_name,
  confrelid::regclass as referenced_table,
  pg_get_constraintdef(oid) as constraint_definition
FROM pg_constraint
WHERE confrelid = 'profiles'::regclass
ORDER BY conrelid::regclass, conname;

-- ============================================================================
-- 2. CORRIGER notification_jobs.actor_id
-- ============================================================================
-- Si un profil est supprimé, l'actor_id dans notification_jobs sera mis à NULL
ALTER TABLE notification_jobs 
DROP CONSTRAINT IF EXISTS notification_jobs_actor_id_fkey;

ALTER TABLE notification_jobs
ADD CONSTRAINT notification_jobs_actor_id_fkey 
FOREIGN KEY (actor_id) 
REFERENCES profiles(id) 
ON DELETE SET NULL;

-- ============================================================================
-- 3. CORRIGER LES AUTRES CONTRAINTES COMMUNES
-- ============================================================================

-- group_join_requests.reviewed_by (si existe)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'group_join_requests' 
    AND column_name = 'reviewed_by'
  ) THEN
    ALTER TABLE group_join_requests 
    DROP CONSTRAINT IF EXISTS group_join_requests_reviewed_by_fkey;
    
    ALTER TABLE group_join_requests
    ADD CONSTRAINT group_join_requests_reviewed_by_fkey 
    FOREIGN KEY (reviewed_by) 
    REFERENCES profiles(id) 
    ON DELETE SET NULL;
    
    RAISE NOTICE '✅ Contrainte group_join_requests.reviewed_by corrigée';
  END IF;
END $$;

-- invitations.used_by (si existe)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'invitations' 
    AND column_name = 'used_by'
  ) THEN
    ALTER TABLE invitations 
    DROP CONSTRAINT IF EXISTS invitations_used_by_fkey;
    
    ALTER TABLE invitations
    ADD CONSTRAINT invitations_used_by_fkey 
    FOREIGN KEY (used_by) 
    REFERENCES profiles(id) 
    ON DELETE SET NULL;
    
    RAISE NOTICE '✅ Contrainte invitations.used_by corrigée';
  END IF;
END $$;

-- matches.created_by (si existe)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'matches' 
    AND column_name = 'created_by'
  ) THEN
    ALTER TABLE matches 
    DROP CONSTRAINT IF EXISTS matches_created_by_fkey;
    
    ALTER TABLE matches
    ADD CONSTRAINT matches_created_by_fkey 
    FOREIGN KEY (created_by) 
    REFERENCES profiles(id) 
    ON DELETE SET NULL;
    
    RAISE NOTICE '✅ Contrainte matches.created_by corrigée';
  END IF;
END $$;

-- groups.created_by (si existe)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'groups' 
    AND column_name = 'created_by'
  ) THEN
    ALTER TABLE groups 
    DROP CONSTRAINT IF EXISTS groups_created_by_fkey;
    
    ALTER TABLE groups
    ADD CONSTRAINT groups_created_by_fkey 
    FOREIGN KEY (created_by) 
    REFERENCES profiles(id) 
    ON DELETE SET NULL;
    
    RAISE NOTICE '✅ Contrainte groups.created_by corrigée';
  END IF;
END $$;

-- club_notifications.created_by (si existe)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'club_notifications' 
    AND column_name = 'created_by'
  ) THEN
    ALTER TABLE club_notifications 
    DROP CONSTRAINT IF EXISTS club_notifications_created_by_fkey;
    
    ALTER TABLE club_notifications
    ADD CONSTRAINT club_notifications_created_by_fkey 
    FOREIGN KEY (created_by) 
    REFERENCES profiles(id) 
    ON DELETE SET NULL;
    
    RAISE NOTICE '✅ Contrainte club_notifications.created_by corrigée';
  END IF;
END $$;

-- ============================================================================
-- 4. VÉRIFICATION FINALE
-- ============================================================================
-- Afficher toutes les contraintes corrigées
DO $$
BEGIN
  RAISE NOTICE '✅ Migration terminée. Toutes les contraintes qui référencent profiles ont été corrigées avec ON DELETE SET NULL.';
END $$;

-- Afficher les contraintes corrigées
SELECT 
  conname as constraint_name,
  conrelid::regclass as table_name,
  pg_get_constraintdef(oid) as constraint_definition
FROM pg_constraint
WHERE confrelid = 'profiles'::regclass
AND pg_get_constraintdef(oid) LIKE '%ON DELETE%'
ORDER BY conrelid::regclass, conname;

