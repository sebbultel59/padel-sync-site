-- À exécuter une fois dans le SQL Editor du dashboard Supabase si l’erreur
-- « Could not find the function public.cancel_group_match_search » apparaît
-- (migration 20260323120000 non appliquée sur le projet distant).

CREATE OR REPLACE FUNCTION public.cancel_group_match_search(p_search_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_group uuid;
  v_creator uuid;
  v_status text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Non authentifié';
  END IF;

  SELECT group_id, creator_user_id, status
  INTO v_group, v_creator, v_status
  FROM group_match_searches
  WHERE id = p_search_id;

  IF v_group IS NULL THEN
    RAISE EXCEPTION 'Recherche introuvable';
  END IF;

  IF v_status IN ('cancelled', 'converted') THEN
    RAISE EXCEPTION 'Cette proposition ne peut plus être supprimée';
  END IF;

  IF v_creator IS DISTINCT FROM v_uid AND NOT can_manage_group(v_group, v_uid) THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;

  UPDATE group_match_searches
  SET status = 'cancelled'
  WHERE id = p_search_id;

  DELETE FROM group_activity_events
  WHERE related_search_id = p_search_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cancel_group_match_search(uuid) TO authenticated;

COMMENT ON FUNCTION public.cancel_group_match_search IS 'Retire la proposition du fil (créateur ou can_manage_group)';
