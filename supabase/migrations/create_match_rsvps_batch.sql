-- Migration: Fonction RPC pour créer des RSVPs en batch en contournant RLS
-- Date: 2025-12-28
-- Permet de créer plusieurs RSVPs pour un match sans déclencher d'erreurs RLS
-- Utile lors de la création de matches avec confirmation directe

CREATE OR REPLACE FUNCTION create_match_rsvps_batch(
  p_match_id UUID,
  p_rsvps JSONB  -- Array of {user_id: UUID, status: TEXT}
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_rsvp_record JSONB;
  v_user_id_val UUID;
  v_status_val TEXT;
BEGIN
  -- Récupérer l'ID de l'utilisateur actuel
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Utilisateur non authentifié';
  END IF;
  
  -- Vérifier que le match existe
  IF NOT EXISTS (SELECT 1 FROM matches WHERE id = p_match_id) THEN
    RAISE EXCEPTION 'Match non trouvé';
  END IF;
  
  -- Parcourir chaque RSVP dans le JSONB
  FOR v_rsvp_record IN SELECT * FROM jsonb_array_elements(p_rsvps)
  LOOP
    v_user_id_val := (v_rsvp_record->>'user_id')::UUID;
    v_status_val := v_rsvp_record->>'status';
    
    -- Normaliser le statut
    v_status_val := CASE 
      WHEN v_status_val IN ('accepted', 'yes', 'oui', 'accepté') THEN 'accepted'
      WHEN v_status_val IN ('maybe', 'peut-être', 'peut etre') THEN 'maybe'
      WHEN v_status_val IN ('no', 'non', 'declined', 'refusé') THEN 'no'
      ELSE v_status_val
    END;
    
    -- Créer ou mettre à jour le RSVP
    INSERT INTO match_rsvps (match_id, user_id, status)
    VALUES (p_match_id, v_user_id_val, v_status_val::rsvp_status)
    ON CONFLICT (match_id, user_id)
    DO UPDATE SET status = EXCLUDED.status::rsvp_status;
  END LOOP;
END;
$$;

-- Donner les permissions d'exécution aux utilisateurs authentifiés
GRANT EXECUTE ON FUNCTION create_match_rsvps_batch(UUID, JSONB) TO authenticated;

-- Comment
COMMENT ON FUNCTION create_match_rsvps_batch IS 
  'Crée plusieurs RSVPs pour un match en contournant RLS. Utilisez cette fonction lors de la création de matches pour éviter les erreurs RLS liées aux triggers.';



