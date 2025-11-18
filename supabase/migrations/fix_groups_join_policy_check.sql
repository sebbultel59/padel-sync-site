-- Migration: Correction de la contrainte CHECK pour join_policy dans groups
-- Date: 2025-01-XX
-- Permet toutes les combinaisons valides de visibility et join_policy

-- Supprimer l'ancienne contrainte si elle existe
ALTER TABLE groups DROP CONSTRAINT IF EXISTS groups_join_policy_check;

-- Créer une nouvelle contrainte qui permet toutes les combinaisons valides :
-- - private + invite (groupe privé)
-- - public + open (groupe public ouvert)
-- - public + request (groupe public sur demande)
-- - public + invite (groupe public sur invitation)
ALTER TABLE groups ADD CONSTRAINT groups_join_policy_check 
  CHECK (
    (visibility = 'private' AND join_policy = 'invite') OR
    (visibility = 'public' AND join_policy IN ('open', 'request', 'invite'))
  );

-- Commentaire pour documentation
COMMENT ON CONSTRAINT groups_join_policy_check ON groups IS 
  'Vérifie que join_policy est valide selon visibility: private+invite, public+open/request/invite';



