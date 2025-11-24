-- ============================================
-- CORRECTION FORCÉE DU TRIGGER
-- ============================================
-- Cette version force l'exécution et log tout

-- 1. Supprimer l'ancien trigger
DROP TRIGGER IF EXISTS club_notifications_to_jobs_trigger ON club_notifications;

-- 2. Recréer la fonction avec plus de robustesse
CREATE OR REPLACE FUNCTION process_club_notification()
RETURNS TRIGGER AS $$
DECLARE
  member_ids UUID[];
  club_name TEXT;
  group_count INTEGER;
  member_count INTEGER;
  v_job_id UUID;
BEGIN
  -- Log de début (toujours visible)
  RAISE NOTICE '[TRIGGER] ========================================';
  RAISE NOTICE '[TRIGGER] Début process_club_notification';
  RAISE NOTICE '[TRIGGER] Notification ID: %', NEW.id;
  RAISE NOTICE '[TRIGGER] Club ID: %', NEW.club_id;
  RAISE NOTICE '[TRIGGER] Message: %', LEFT(NEW.message, 50);
  RAISE NOTICE '[TRIGGER] Created by: %', NEW.created_by;
  
  -- Vérifier que le club existe
  BEGIN
    SELECT name INTO club_name
    FROM clubs
    WHERE id = NEW.club_id;
    
    IF club_name IS NULL THEN
      RAISE WARNING '[TRIGGER] ❌ Club % n''existe pas', NEW.club_id;
      RETURN NEW;
    END IF;
    
    RAISE NOTICE '[TRIGGER] ✅ Club trouvé: "%"', club_name;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '[TRIGGER] ❌ Erreur lors de la recherche du club: %', SQLERRM;
    RETURN NEW;
  END;
  
  -- Compter les groupes du club
  BEGIN
    SELECT COUNT(DISTINCT g.id) INTO group_count
    FROM groups g
    WHERE g.club_id = NEW.club_id;
    
    RAISE NOTICE '[TRIGGER] Groupes trouvés: %', group_count;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '[TRIGGER] ❌ Erreur lors du comptage des groupes: %', SQLERRM;
    RETURN NEW;
  END;
  
  -- Si aucun groupe, on ne fait rien
  IF group_count = 0 THEN
    RAISE WARNING '[TRIGGER] ⚠️ Aucun groupe trouvé pour le club %', NEW.club_id;
    RETURN NEW;
  END IF;
  
  -- Récupérer tous les membres des groupes du club
  BEGIN
    SELECT ARRAY_AGG(DISTINCT gm.user_id)
    INTO member_ids
    FROM group_members gm
    INNER JOIN groups g ON g.id = gm.group_id
    WHERE g.club_id = NEW.club_id
      AND gm.user_id IS NOT NULL;
    
    member_count := COALESCE(array_length(member_ids, 1), 0);
    RAISE NOTICE '[TRIGGER] Membres trouvés: %', member_count;
    
    IF member_ids IS NOT NULL AND member_count > 0 THEN
      RAISE NOTICE '[TRIGGER] IDs membres: %', member_ids;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '[TRIGGER] ❌ Erreur lors de la récupération des membres: %', SQLERRM;
    RETURN NEW;
  END;
  
  -- Si aucun membre trouvé, on ne fait rien
  IF member_ids IS NULL OR member_count = 0 THEN
    RAISE WARNING '[TRIGGER] ⚠️ Aucun membre trouvé (groupes: %)', group_count;
    RETURN NEW;
  END IF;
  
  -- Créer le notification_job
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
      member_ids,
      NULL,
      NULL,
      NEW.created_by,
      jsonb_build_object(
        'title', COALESCE(club_name, 'Votre club'),
        'message', NEW.message,
        'club_id', NEW.club_id::text
      ),
      NEW.created_at
    )
    RETURNING id INTO v_job_id;
    
    RAISE NOTICE '[TRIGGER] ✅✅✅ JOB CRÉÉ AVEC SUCCÈS !';
    RAISE NOTICE '[TRIGGER] Job ID: %', v_job_id;
    RAISE NOTICE '[TRIGGER] Destinataires: %', member_count;
    RAISE NOTICE '[TRIGGER] ========================================';
    
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '[TRIGGER] ❌❌❌ ERREUR LORS DE LA CRÉATION DU JOB';
    RAISE WARNING '[TRIGGER] Code erreur: %', SQLSTATE;
    RAISE WARNING '[TRIGGER] Message: %', SQLERRM;
    RAISE WARNING '[TRIGGER] ========================================';
    -- On continue quand même pour ne pas bloquer l'insertion
  END;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Recréer le trigger
CREATE TRIGGER club_notifications_to_jobs_trigger
  AFTER INSERT ON club_notifications
  FOR EACH ROW
  EXECUTE FUNCTION process_club_notification();

-- 4. Vérification
SELECT 
  '✅ Trigger recréé' as status,
  tgname as trigger_name,
  tgrelid::regclass as table_name,
  CASE tgenabled 
    WHEN 'O' THEN '✅ Activé'
    ELSE '❌ Désactivé'
  END as enabled
FROM pg_trigger 
WHERE tgname = 'club_notifications_to_jobs_trigger';

-- 5. Message de confirmation
DO $$
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Trigger recréé avec logs détaillés';
  RAISE NOTICE 'Créez une nouvelle notification pour tester';
  RAISE NOTICE 'Vérifiez les logs: Database > Logs';
  RAISE NOTICE '========================================';
END $$;

