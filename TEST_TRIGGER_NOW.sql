-- ============================================
-- TEST AUTOMATIQUE DU TRIGGER
-- ============================================

DO $$
DECLARE
  v_club_id UUID := 'cf119a51-9e37-41cc-8b48-2a4457030782'; -- Hercule & Hops (3 membres)
  v_user_id UUID;
  v_notification_id UUID;
  v_job_count INTEGER;
  v_group_count INTEGER;
  v_member_count INTEGER;
  v_member_ids UUID[];
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE 'TEST DU TRIGGER DE NOTIFICATIONS DE CLUB';
  RAISE NOTICE '========================================';
  
  -- Vérifier les groupes et membres du club
  SELECT 
    COUNT(DISTINCT g.id),
    COUNT(DISTINCT gm.user_id),
    ARRAY_AGG(DISTINCT gm.user_id)
  INTO v_group_count, v_member_count, v_member_ids
  FROM groups g
  INNER JOIN group_members gm ON gm.group_id = g.id
  WHERE g.club_id = v_club_id;
  
  RAISE NOTICE 'Club: %', v_club_id;
  RAISE NOTICE 'Groupes trouvés: %', v_group_count;
  RAISE NOTICE 'Membres trouvés: %', v_member_count;
  RAISE NOTICE 'IDs des membres: %', v_member_ids;
  
  IF v_member_count = 0 THEN
    RAISE EXCEPTION 'Aucun membre trouvé pour ce club';
  END IF;
  
  -- Récupérer un utilisateur club_manager de ce club
  SELECT id INTO v_user_id
  FROM profiles
  WHERE role = 'club_manager'
  AND club_id = v_club_id
  LIMIT 1;
  
  IF v_user_id IS NULL THEN
    -- Sinon, prendre n'importe quel utilisateur
    SELECT id INTO v_user_id FROM profiles LIMIT 1;
    RAISE NOTICE 'Aucun club_manager trouvé, utilisation de: %', v_user_id;
  ELSE
    RAISE NOTICE 'Club manager trouvé: %', v_user_id;
  END IF;
  
  -- Compter les jobs avant
  SELECT COUNT(*) INTO v_job_count
  FROM notification_jobs 
  WHERE kind = 'club_notification';
  
  RAISE NOTICE 'Jobs existants avant test: %', v_job_count;
  
  -- Créer une notification de test
  RAISE NOTICE '';
  RAISE NOTICE '📝 Création d''une notification de test...';
  
  INSERT INTO club_notifications (club_id, message, created_by)
  VALUES (v_club_id, 'Test automatique du trigger - ' || NOW()::text, v_user_id)
  RETURNING id INTO v_notification_id;
  
  RAISE NOTICE '✅ Notification créée avec ID: %', v_notification_id;
  RAISE NOTICE '⏳ Attente de 3 secondes pour que le trigger s''exécute...';
  
  -- Attendre que le trigger s'exécute
  PERFORM pg_sleep(3);
  
  -- Vérifier si un job a été créé
  SELECT COUNT(*) INTO v_job_count
  FROM notification_jobs 
  WHERE kind = 'club_notification' 
  AND payload->>'club_id' = v_club_id::text
  AND created_at > NOW() - INTERVAL '5 minutes';
  
  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  IF v_job_count > 0 THEN
    RAISE NOTICE '✅✅✅ SUCCÈS: % job(s) créé(s) !', v_job_count;
    RAISE NOTICE 'Le trigger fonctionne correctement !';
    
    -- Afficher les détails du job créé
    RAISE NOTICE '';
    RAISE NOTICE 'Détails du job créé:';
    FOR v_job_count IN 
      SELECT id, kind, array_length(recipients, 1) as nb_recipients, created_at
      FROM notification_jobs 
      WHERE kind = 'club_notification' 
      AND payload->>'club_id' = v_club_id::text
      AND created_at > NOW() - INTERVAL '5 minutes'
      ORDER BY created_at DESC
      LIMIT 1
    LOOP
      RAISE NOTICE '  - ID: %', v_job_count;
    END LOOP;
  ELSE
    RAISE WARNING '❌❌❌ ÉCHEC: Aucun job créé';
    RAISE NOTICE '';
    RAISE NOTICE 'DIAGNOSTIC:';
    RAISE NOTICE '1. Vérifiez les logs Supabase (Database > Logs)';
    RAISE NOTICE '2. Cherchez les messages [process_club_notification]';
    RAISE NOTICE '3. Vérifiez les permissions RLS sur notification_jobs';
    RAISE NOTICE '4. Vérifiez que la fonction a SECURITY DEFINER';
  END IF;
  RAISE NOTICE '========================================';
  
END $$;

-- Afficher les jobs créés récemment
SELECT 
  'Jobs créés récemment:' as info,
  id,
  kind,
  array_length(recipients, 1) as nb_recipients,
  payload->>'club_id' as club_id,
  created_at
FROM notification_jobs 
WHERE kind = 'club_notification'
ORDER BY created_at DESC
LIMIT 5;

