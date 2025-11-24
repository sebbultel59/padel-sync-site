-- ============================================
-- CORRECTION : S'assurer que le message est bien dans le payload
-- ============================================

-- Recréer la fonction avec vérification du message
CREATE OR REPLACE FUNCTION process_club_notification()
RETURNS TRIGGER AS $$
DECLARE
  member_ids UUID[];
  club_name TEXT;
  group_count INTEGER;
  member_count INTEGER;
  v_job_id UUID;
  v_message TEXT;
  v_unique_count INTEGER;
BEGIN
  -- Récupérer le message (s'assurer qu'il n'est pas NULL)
  v_message := COALESCE(NEW.message, 'Nouvelle notification de votre club');
  
  -- Log de début
  RAISE NOTICE '[TRIGGER] Message reçu: %', v_message;
  
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
  
  -- Récupérer les membres UNIQUEMENT (double DISTINCT pour garantir l'unicité)
  -- IMPORTANT: Un utilisateur dans plusieurs groupes ne recevra qu'une seule notification
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
  
  -- Vérifier qu'il n'y a pas de doublons (sécurité supplémentaire)
  IF member_ids IS NOT NULL AND member_count > 0 THEN
    BEGIN
      SELECT COUNT(DISTINCT unnest) INTO v_unique_count
      FROM unnest(member_ids) AS unnest;
      
      IF v_unique_count < member_count THEN
        RAISE WARNING '[TRIGGER] ⚠️ Doublons détectés: % membres mais % uniques', member_count, v_unique_count;
        -- Recréer le tableau sans doublons
        SELECT ARRAY_AGG(DISTINCT unnest) INTO member_ids
        FROM unnest(member_ids) AS unnest;
        member_count := array_length(member_ids, 1);
        RAISE NOTICE '[TRIGGER] ✅ Doublons supprimés, % membres uniques', member_count;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      -- En cas d'erreur, continuer avec le tableau original
      RAISE WARNING '[TRIGGER] Erreur vérification doublons: %', SQLERRM;
    END;
  END IF;
  
  IF member_ids IS NULL OR member_count = 0 THEN
    RAISE WARNING '[TRIGGER] Aucun membre trouvé (groupes: %)', group_count;
    RETURN NEW;
  END IF;
  
  -- Créer le notification_job avec le message bien présent
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
        'message', v_message,  -- Utiliser la variable avec COALESCE
        'body', v_message,      -- Ajouter aussi 'body' au cas où
        'club_id', NEW.club_id::text
      ),
      NEW.created_at
    )
    RETURNING id INTO v_job_id;
    
    RAISE NOTICE '[TRIGGER] ✅ Job créé: % destinataires, message: %', member_count, LEFT(v_message, 50);
    
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

