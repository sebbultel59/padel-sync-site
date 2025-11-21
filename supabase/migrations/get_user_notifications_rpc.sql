-- Migration: Fonction RPC pour récupérer les notifications d'un utilisateur
-- Cette fonction contourne les politiques RLS pour permettre aux utilisateurs de lire leurs notifications

CREATE OR REPLACE FUNCTION get_user_notifications(
  p_user_id UUID,
  p_limit INTEGER DEFAULT 100
)
RETURNS TABLE (
  id UUID,
  created_at TIMESTAMPTZ,
  kind TEXT,
  group_id UUID,
  match_id UUID,
  actor_id UUID,
  recipients UUID[],
  payload JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    nj.id,
    nj.created_at,
    nj.kind,
    nj.group_id,
    nj.match_id,
    nj.actor_id,
    nj.recipients,
    nj.payload
  FROM notification_jobs nj
  WHERE p_user_id = ANY(nj.recipients)
  ORDER BY nj.created_at DESC
  LIMIT p_limit;
END;
$$;

-- Donner les permissions d'exécution aux utilisateurs authentifiés
GRANT EXECUTE ON FUNCTION get_user_notifications(UUID, INTEGER) TO authenticated;

