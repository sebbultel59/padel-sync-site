-- Migration: Fonction RPC pour créer une notification de test
-- Cette fonction contourne les politiques RLS pour permettre aux utilisateurs de créer des notifications de test

CREATE OR REPLACE FUNCTION create_test_notification(
  p_user_id UUID,
  p_group_id UUID,
  p_title TEXT DEFAULT '🧪 Test de notification',
  p_message TEXT DEFAULT 'Ceci est une notification de test. Si vous voyez ce message, les notifications fonctionnent correctement !'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_notification_id UUID;
BEGIN
  -- Vérifier que l'utilisateur est membre du groupe
  IF NOT EXISTS (
    SELECT 1 
    FROM group_members 
    WHERE user_id = p_user_id 
      AND group_id = p_group_id
  ) THEN
    RAISE EXCEPTION 'L''utilisateur n''est pas membre de ce groupe';
  END IF;

  -- Créer la notification de test
  INSERT INTO notification_jobs (
    kind,
    recipients,
    group_id,
    actor_id,
    payload,
    created_at
  )
  VALUES (
    'test',
    ARRAY[p_user_id]::UUID[],
    p_group_id,
    p_user_id,
    jsonb_build_object(
      'title', p_title,
      'message', p_message
    ),
    NOW()
  )
  RETURNING id INTO v_notification_id;

  RETURN v_notification_id;
END;
$$;

-- Donner les permissions d'exécution aux utilisateurs authentifiés
GRANT EXECUTE ON FUNCTION create_test_notification(UUID, UUID, TEXT, TEXT) TO authenticated;

