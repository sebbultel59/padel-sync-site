-- ============================================
-- TEST DU TRIGGER AVEC AFFICHAGE DES RÉSULTATS
-- ============================================
-- Ce script teste le trigger et affiche les résultats directement ici

DO $$
DECLARE
  v_club_id UUID := 'cf119a51-9e37-41cc-8b48-2a4457030782'; -- Hercule & Hops
  v_user_id UUID;
  v_notification_id UUID;
  v_job_count_before INTEGER;
  v_job_count_after INTEGER;
  v_job_id UUID;
  v_group_count INTEGER;
  v_member_count INTEGER;
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE 'TEST DU TRIGGER DE NOTIFICATIONS';
  RAISE NOTICE '========================================';
  
  -- Récupérer un utilisateur
  SELECT DISTINCT gm.user_id INTO v_user_id
  FROM groups g
  INNER JOIN group_members gm ON gm.group_id = g.id
  WHERE g.club_id = v_club_id
  LIMIT 1;
  
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Aucun utilisateur trouvé pour ce club';
  END IF;
  
  -- Compter les groupes et membres
  SELECT 
    COUNT(DISTINCT g.id),
    COUNT(DISTINCT gm.user_id)
  INTO v_group_count, v_member_count
  FROM groups g
  INNER JOIN group_members gm ON gm.group_id = g.id
  WHERE g.club_id = v_club_id;
  
  RAISE NOTICE 'Club: %', v_club_id;
  RAISE NOTICE 'Groupes: %', v_group_count;
  RAISE NOTICE 'Membres: %', v_member_count;
  RAISE NOTICE 'Utilisateur test: %', v_user_id;
  
  -- Compter les jobs avant
  SELECT COUNT(*) INTO v_job_count_before
  FROM notification_jobs 
  WHERE kind = 'club_notification';
  
  RAISE NOTICE '';
  RAISE NOTICE 'Jobs avant: %', v_job_count_before;
  
  -- Créer une notification
  RAISE NOTICE 'Création d''une notification...';
  
  INSERT INTO club_notifications (club_id, message, created_by)
  VALUES (v_club_id, 'Test trigger - ' || TO_CHAR(NOW(), 'HH24:MI:SS'), v_user_id)
  RETURNING id INTO v_notification_id;
  
  RAISE NOTICE 'Notification créée: %', v_notification_id;
  RAISE NOTICE 'Attente de 3 secondes...';
  
  PERFORM pg_sleep(3);
  
  -- Compter les jobs après
  SELECT COUNT(*) INTO v_job_count_after
  FROM notification_jobs 
  WHERE kind = 'club_notification';
  
  RAISE NOTICE '';
  RAISE NOTICE 'Jobs après: %', v_job_count_after;
  RAISE NOTICE 'Différence: %', (v_job_count_after - v_job_count_before);
  
  -- Vérifier le job créé
  SELECT id INTO v_job_id
  FROM notification_jobs 
  WHERE kind = 'club_notification' 
  AND payload->>'club_id' = v_club_id::text
  AND created_at > NOW() - INTERVAL '5 minutes'
  ORDER BY created_at DESC
  LIMIT 1;
  
  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  IF v_job_id IS NOT NULL THEN
    RAISE NOTICE '✅✅✅ SUCCÈS !';
    RAISE NOTICE 'Job créé avec ID: %', v_job_id;
  ELSE
    RAISE WARNING '❌ ÉCHEC: Aucun job créé';
    RAISE NOTICE 'Le trigger ne s''est pas exécuté ou a échoué';
  END IF;
  RAISE NOTICE '========================================';
  
END $$;

-- Afficher les jobs créés récemment
SELECT 
  'Résultat:' as info,
  id,
  kind,
  array_length(recipients, 1) as nb_recipients,
  payload->>'club_id' as club_id,
  payload->>'title' as title,
  LEFT(payload->>'message', 50) as message,
  created_at
FROM notification_jobs 
WHERE kind = 'club_notification'
ORDER BY created_at DESC
LIMIT 5;

