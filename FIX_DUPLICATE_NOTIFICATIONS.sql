-- ============================================
-- CORRECTION : Éviter les notifications en double
-- ============================================
-- Le problème peut venir du fait qu'un utilisateur est dans plusieurs groupes
-- et reçoit donc plusieurs notifications. On doit s'assurer qu'un utilisateur
-- ne reçoit qu'une seule notification même s'il est dans plusieurs groupes.

-- Recréer la fonction avec DISTINCT sur les membres
CREATE OR REPLACE FUNCTION process_club_notification()
RETURNS TRIGGER AS $$
DECLARE
  member_ids UUID[];
  club_name TEXT;
  group_count INTEGER;
  member_count INTEGER;
  v_job_id UUID;
  v_message TEXT;
  v_notification_id UUID;
BEGIN
  -- Récupérer le message (s'assurer qu'il n'est pas NULL)
  v_message := COALESCE(NEW.message, 'Nouvelle notification de votre club');
  v_notification_id := NEW.id;
  
  -- Vérifier si un job existe déjà pour cette notification
  -- (protection contre les doubles déclenchements)
  IF EXISTS (
    SELECT 1 FROM notification_jobs 
    WHERE kind = 'club_notification' 
    AND payload->>'club_id' = NEW.club_id::text
    AND payload->>'message' = v_message
    AND created_at >= NEW.created_at - INTERVAL '1 minute'
  ) THEN
    RAISE NOTICE '[TRIGGER] ⚠️ Job déjà créé pour cette notification, ignoré';
    RETURN NEW;
  END IF;
  
  -- Vérifier que le club existe
  IF NOT EXISTS (SELECT 1 FROM clubs WHERE id = NEW.club_id) THEN
    RAISE WARNING '[TRIGGER] Club % n''existe pas', NEW.club_id;
    RETURN NEW;
  END IF;
  
  -- Récupérer le nom du club
  SELECT name INTO club_name
  FROM clubs
  WHERE id = NEW.club_id;
  
  -- Compter les groupes
  SELECT COUNT(DISTINCT g.id) INTO group_count
  FROM groups g
  WHERE g.club_id = NEW.club_id;
  
  IF group_count = 0 THEN
    RAISE WARNING '[TRIGGER] Aucun groupe trouvé pour le club %', NEW.club_id;
    RETURN NEW;
  END IF;
  
  -- Récupérer les membres UNIQUEMENT (DISTINCT déjà dans ARRAY_AGG)
  -- IMPORTANT: Un utilisateur dans plusieurs groupes ne recevra qu'une seule notification
  -- Utiliser une sous-requête avec DISTINCT pour garantir l'unicité
  SELECT ARRAY_AGG(DISTINCT user_id)
  INTO member_ids
  FROM (
    SELECT DISTINCT gm.user_id
    FROM group_members gm
    INNER JOIN groups g ON g.id = gm.group_id
    WHERE g.club_id = NEW.club_id
      AND gm.user_id IS NOT NULL
  ) AS unique_members;
  
  member_count := COALESCE(array_length(member_ids, 1), 0);
  
  -- Log pour vérifier qu'il n'y a pas de doublons
  RAISE NOTICE '[TRIGGER] Membres uniques: % (vérification doublons)', member_count;
  
  IF member_ids IS NULL OR member_count = 0 THEN
    RAISE WARNING '[TRIGGER] Aucun membre trouvé (groupes: %)', group_count;
    RETURN NEW;
  END IF;
  
  -- Créer UN SEUL notification_job avec TOUS les destinataires (sans doublons)
  BEGIN
    INSERT INTO notification_jobs (
      kind,
      recipients,
      group_id,
      match_id,
      actor_id,
      payload,
      created_at
    )
    VALUES (
      'club_notification',
      member_ids,  -- Array avec tous les membres uniques
      NULL,
      NULL,
      NEW.created_by,
      jsonb_build_object(
        'title', COALESCE(club_name, 'Votre club'),
        'message', v_message,
        'body', v_message,
        'club_id', NEW.club_id::text,
        'notification_id', v_notification_id::text  -- Ajouter l'ID pour éviter les doublons
      ),
      NEW.created_at
    )
    RETURNING id INTO v_job_id;
    
    RAISE NOTICE '[TRIGGER] ✅ Job créé: % destinataires uniques, message: %', member_count, LEFT(v_message, 50);
    
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '[TRIGGER] ❌ Erreur: %', SQLERRM;
  END;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Vérification
SELECT 
  'Fonction mise à jour' as status,
  proname as function_name,
  prosecdef as security_definer
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
AND p.proname = 'process_club_notification';

