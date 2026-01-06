-- Migration: Corriger la contrainte de clé étrangère notification_jobs.actor_id
-- Date: 2025-01-XX
-- Description: Ajoute ON DELETE SET NULL pour permettre la suppression de profils
--              même s'ils sont référencés dans notification_jobs

-- 1. Vérifier la contrainte actuelle
SELECT 
  conname as constraint_name,
  pg_get_constraintdef(oid) as constraint_definition
FROM pg_constraint
WHERE conrelid = 'notification_jobs'::regclass
AND conname = 'notification_jobs_actor_id_fkey';

-- 2. Supprimer l'ancienne contrainte
ALTER TABLE notification_jobs 
DROP CONSTRAINT IF EXISTS notification_jobs_actor_id_fkey;

-- 3. Recréer la contrainte avec ON DELETE SET NULL
-- Cela permet de supprimer un profil même s'il est référencé dans notification_jobs
-- L'actor_id sera mis à NULL au lieu de bloquer la suppression
ALTER TABLE notification_jobs
ADD CONSTRAINT notification_jobs_actor_id_fkey 
FOREIGN KEY (actor_id) 
REFERENCES profiles(id) 
ON DELETE SET NULL;

-- 4. Vérifier que la nouvelle contrainte existe
SELECT 
  conname as constraint_name,
  pg_get_constraintdef(oid) as constraint_definition
FROM pg_constraint
WHERE conrelid = 'notification_jobs'::regclass
AND conname = 'notification_jobs_actor_id_fkey';

-- 5. Commentaire
COMMENT ON CONSTRAINT notification_jobs_actor_id_fkey ON notification_jobs IS 
  'Référence vers le profil de l''acteur. Si le profil est supprimé, actor_id est mis à NULL.';

