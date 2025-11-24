-- Migration: Trigger pour transformer les notifications de club en notification_jobs
-- Date: 2025-11-24
-- Description: Quand un club manager envoie une notification via club_notifications,
--              ce trigger crée automatiquement des notification_jobs pour tous les membres
--              des groupes du club, ce qui déclenchera l'envoi des notifications push.

-- Fonction qui crée les notification_jobs à partir d'une club_notification
CREATE OR REPLACE FUNCTION process_club_notification()
RETURNS TRIGGER AS $$
DECLARE
  member_ids UUID[];
  club_name TEXT;
  group_count INTEGER;
  member_count INTEGER;
BEGIN
  -- Log de début
  RAISE NOTICE '[process_club_notification] Début traitement notification club_id: %, message: %', NEW.club_id, LEFT(NEW.message, 50);
  
  -- Vérifier que le club existe
  IF NOT EXISTS (SELECT 1 FROM clubs WHERE id = NEW.club_id) THEN
    RAISE WARNING '[process_club_notification] Club % n''existe pas', NEW.club_id;
    RETURN NEW;
  END IF;
  
  -- Récupérer le nom du club pour le message
  SELECT name INTO club_name
  FROM clubs
  WHERE id = NEW.club_id;
  
  -- Compter les groupes du club
  SELECT COUNT(DISTINCT g.id) INTO group_count
  FROM groups g
  WHERE g.club_id = NEW.club_id;
  
  RAISE NOTICE '[process_club_notification] Club "%" a % groupe(s)', COALESCE(club_name, 'Inconnu'), group_count;
  
  -- Si aucun groupe, on ne fait rien
  IF group_count = 0 THEN
    RAISE WARNING '[process_club_notification] Aucun groupe trouvé pour le club %', NEW.club_id;
    RETURN NEW;
  END IF;
  
  -- Récupérer tous les membres des groupes du club
  -- Un membre peut être dans plusieurs groupes, donc on utilise DISTINCT
  SELECT ARRAY_AGG(DISTINCT gm.user_id)
  INTO member_ids
  FROM group_members gm
  INNER JOIN groups g ON g.id = gm.group_id
  WHERE g.club_id = NEW.club_id
    AND gm.user_id IS NOT NULL;
  
  -- Compter les membres
  member_count := COALESCE(array_length(member_ids, 1), 0);
  
  RAISE NOTICE '[process_club_notification] % membre(s) trouvé(s) dans les groupes du club', member_count;
  
  -- Si aucun membre trouvé, on ne fait rien
  IF member_ids IS NULL OR member_count = 0 THEN
    RAISE WARNING '[process_club_notification] Aucun membre trouvé pour le club % (groupes: %)', NEW.club_id, group_count;
    RETURN NEW;
  END IF;
  
  -- Créer un notification_job pour chaque membre
  -- On groupe par club pour éviter de créer trop de jobs individuels
  -- On crée un seul job avec tous les destinataires
  BEGIN
    INSERT INTO notification_jobs (
      kind,
      recipients,
      group_id,  -- NULL car c'est une notification de club, pas de groupe spécifique
      match_id,  -- NULL car ce n'est pas lié à un match
      actor_id,  -- L'utilisateur qui a créé la notification
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
    );
    
    RAISE NOTICE '[process_club_notification] ✅ Job créé avec succès: % destinataires pour le club "%"', member_count, COALESCE(club_name, 'Inconnu');
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '[process_club_notification] ❌ Erreur lors de la création du job: %', SQLERRM;
    -- On continue quand même pour ne pas bloquer l'insertion de la notification
  END;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Créer le trigger
DROP TRIGGER IF EXISTS club_notifications_to_jobs_trigger ON club_notifications;
CREATE TRIGGER club_notifications_to_jobs_trigger
  AFTER INSERT ON club_notifications
  FOR EACH ROW
  EXECUTE FUNCTION process_club_notification();

-- Ajouter le type 'club_notification' dans la fonction renderMessage de dispatch-notifs
-- Note: Il faudra aussi mettre à jour la fonction Edge Function dispatch-notifs/index.ts
-- pour gérer le type 'club_notification'

COMMENT ON FUNCTION process_club_notification() IS 
  'Transforme les notifications de club en notification_jobs pour l''envoi push';

