-- Migration: Trigger pour mettre à jour automatiquement les ratings quand un match est complété
-- Date: 2025-12-06
-- Crée un trigger qui appelle l'Edge Function update-match-ratings quand match_results.status passe à 'completed'

-- ============================================================================
-- Option 1: Trigger SQL qui appelle directement l'Edge Function via http
-- ============================================================================
-- Note: Cette approche nécessite l'extension pg_net ou pg_http pour faire des appels HTTP depuis PostgreSQL
-- Si ces extensions ne sont pas disponibles, utiliser l'Option 2 (appel manuel depuis l'app)

-- Fonction SQL pour appeler l'Edge Function (nécessite pg_net ou pg_http)
CREATE OR REPLACE FUNCTION call_update_match_ratings_function(p_match_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_response text;
BEGIN
  -- Appel HTTP à l'Edge Function (nécessite l'extension pg_net)
  -- Note: Cette fonction nécessite que l'extension pg_net soit activée dans Supabase
  -- Si pg_net n'est pas disponible, cette fonction ne fonctionnera pas
  -- Dans ce cas, utiliser l'approche manuelle depuis l'app (Option 2)
  
  -- Exemple avec pg_net (à adapter selon votre configuration Supabase)
  -- SELECT net.http_post(
  --   url := current_setting('app.supabase_url') || '/functions/v1/update-match-ratings',
  --   headers := jsonb_build_object(
  --     'Content-Type', 'application/json',
  --     'Authorization', 'Bearer ' || current_setting('app.service_role_key')
  --   ),
  --   body := jsonb_build_object('match_id', p_match_id)
  -- ) INTO v_response;
  
  -- Pour l'instant, on log juste (à remplacer par l'appel HTTP réel si pg_net est disponible)
  RAISE NOTICE 'Match % should trigger rating update (Edge Function call would happen here)', p_match_id;
  
  -- TODO: Si pg_net est disponible, décommenter et adapter le code ci-dessus
END;
$$;

-- ============================================================================
-- Option 2: Trigger SQL qui insère dans une table de queue (recommandé)
-- ============================================================================
-- Cette approche est plus fiable car elle ne dépend pas d'extensions externes
-- L'app ou un worker peut ensuite traiter la queue

-- Table de queue pour les mises à jour de ratings
CREATE TABLE IF NOT EXISTS rating_update_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  match_result_id UUID NOT NULL REFERENCES match_results(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  UNIQUE(match_result_id)
);

-- Index pour la queue
CREATE INDEX IF NOT EXISTS idx_rating_update_queue_status ON rating_update_queue(status, created_at);
CREATE INDEX IF NOT EXISTS idx_rating_update_queue_match_id ON rating_update_queue(match_id);

-- Fonction pour ajouter un match à la queue
CREATE OR REPLACE FUNCTION queue_rating_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Seulement si le status passe à 'completed' et qu'il y a un gagnant
  IF NEW.status = 'completed' AND NEW.winner_team IS NOT NULL THEN
    -- Vérifier qu'il n'existe pas déjà une entrée pour ce match_result
    INSERT INTO rating_update_queue (match_id, match_result_id, status)
    VALUES (NEW.match_id, NEW.id, 'pending')
    ON CONFLICT (match_result_id) DO UPDATE
    SET status = 'pending',
        created_at = NOW(),
        error_message = NULL,
        processed_at = NULL;
    
    RAISE NOTICE 'Match % queued for rating update', NEW.match_id;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Trigger sur match_results pour ajouter à la queue
DROP TRIGGER IF EXISTS trigger_queue_rating_update ON match_results;
CREATE TRIGGER trigger_queue_rating_update
  AFTER INSERT OR UPDATE OF status, winner_team ON match_results
  FOR EACH ROW
  WHEN (NEW.status = 'completed' AND NEW.winner_team IS NOT NULL)
  EXECUTE FUNCTION queue_rating_update();

-- ============================================================================
-- Fonction RPC pour traiter la queue (à appeler depuis l'app ou un worker)
-- ============================================================================

-- Fonction pour marquer une entrée de queue comme traitée
CREATE OR REPLACE FUNCTION mark_rating_update_completed(p_queue_id UUID, p_success BOOLEAN, p_error_message TEXT DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE rating_update_queue
  SET status = CASE WHEN p_success THEN 'completed' ELSE 'failed' END,
      error_message = p_error_message,
      processed_at = NOW()
  WHERE id = p_queue_id;
END;
$$;

-- Fonction pour obtenir les prochaines entrées à traiter
CREATE OR REPLACE FUNCTION get_pending_rating_updates(p_limit INTEGER DEFAULT 10)
RETURNS TABLE (
  queue_id UUID,
  match_id UUID,
  match_result_id UUID,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    ruq.id,
    ruq.match_id,
    ruq.match_result_id,
    ruq.created_at
  FROM rating_update_queue ruq
  WHERE ruq.status = 'pending'
  ORDER BY ruq.created_at ASC
  LIMIT p_limit
  FOR UPDATE SKIP LOCKED; -- Évite les conflits si plusieurs workers traitent en parallèle
END;
$$;

-- ============================================================================
-- Commentaires pour documentation
-- ============================================================================

COMMENT ON TABLE rating_update_queue IS 
  'Queue pour les mises à jour de ratings. Les entrées sont créées automatiquement par le trigger quand un match est complété.';
COMMENT ON FUNCTION queue_rating_update() IS 
  'Trigger function qui ajoute un match à la queue de mise à jour de ratings quand il est complété.';
COMMENT ON FUNCTION get_pending_rating_updates(INTEGER) IS 
  'Récupère les prochaines entrées de la queue à traiter. À appeler depuis l''app ou un worker.';
COMMENT ON FUNCTION mark_rating_update_completed(UUID, BOOLEAN, TEXT) IS 
  'Marque une entrée de queue comme traitée (succès ou échec).';

