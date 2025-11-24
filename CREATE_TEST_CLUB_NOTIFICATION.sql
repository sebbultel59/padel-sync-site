-- ============================================
-- CRÉER UNE NOUVELLE NOTIFICATION DE CLUB
-- ============================================
-- Ce script crée une nouvelle notification de club
-- Le trigger devrait se déclencher automatiquement

DO $$
DECLARE
  v_club_id UUID := 'cf119a51-9e37-41cc-8b48-2a4457030782'; -- Hercule & Hops
  v_user_id UUID;
  v_notification_id UUID;
  v_job_id UUID;
  v_job_count INTEGER;
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE 'CRÉATION D''UNE NOTIFICATION DE CLUB';
  RAISE NOTICE '========================================';
  
  -- Récupérer un utilisateur club_manager de ce club
  SELECT id INTO v_user_id
  FROM profiles
  WHERE role = 'club_manager'
  AND club_id = v_club_id
  LIMIT 1;
  
  IF v_user_id IS NULL THEN
    -- Sinon, prendre n'importe quel utilisateur membre d'un groupe du club
    SELECT DISTINCT gm.user_id INTO v_user_id
    FROM groups g
    INNER JOIN group_members gm ON gm.group_id = g.id
    WHERE g.club_id = v_club_id
    LIMIT 1;
    
    IF v_user_id IS NULL THEN
      RAISE EXCEPTION 'Aucun utilisateur trouvé pour ce club';
    END IF;
    
    RAISE NOTICE 'Utilisation d''un membre du club: %', v_user_id;
  ELSE
    RAISE NOTICE 'Club manager trouvé: %', v_user_id;
  END IF;
  
  -- Compter les jobs avant
  SELECT COUNT(*) INTO v_job_count
  FROM notification_jobs 
  WHERE kind = 'club_notification';
  
  RAISE NOTICE 'Jobs club_notification existants: %', v_job_count;
  
  -- Créer une NOUVELLE notification de club
  RAISE NOTICE '';
  RAISE NOTICE '📝 Création d''une nouvelle notification...';
  
  INSERT INTO club_notifications (club_id, message, created_by)
  VALUES (
    v_club_id, 
    'Test notification - ' || TO_CHAR(NOW(), 'HH24:MI:SS'),
    v_user_id
  )
  RETURNING id INTO v_notification_id;
  
  RAISE NOTICE '✅ Notification créée avec ID: %', v_notification_id;
  RAISE NOTICE '⏳ Attente de 2 secondes pour que le trigger s''exécute...';
  
  -- Attendre que le trigger s'exécute
  PERFORM pg_sleep(2);
  
  -- Vérifier si un job a été créé
  SELECT COUNT(*) INTO v_job_count
  FROM notification_jobs 
  WHERE kind = 'club_notification' 
  AND created_at > NOW() - INTERVAL '1 minute';
  
  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  IF v_job_count > 0 THEN
    RAISE NOTICE '✅✅✅ SUCCÈS: % nouveau(x) job(s) créé(s) !', v_job_count;
    
    -- Afficher les détails
    FOR v_job_id IN 
      SELECT id
      FROM notification_jobs 
      WHERE kind = 'club_notification' 
      AND created_at > NOW() - INTERVAL '1 minute'
      ORDER BY created_at DESC
    LOOP
      RAISE NOTICE 'Job ID: %', v_job_id;
    END LOOP;
  ELSE
    RAISE WARNING '❌ ÉCHEC: Aucun nouveau job créé';
    RAISE NOTICE '';
    RAISE NOTICE 'Vérifiez:';
    RAISE NOTICE '1. Les logs Supabase (Database > Logs)';
    RAISE NOTICE '2. Cherchez [process_club_notification]';
    RAISE NOTICE '3. Vérifiez que le trigger est bien activé';
  END IF;
  RAISE NOTICE '========================================';
  
END $$;

-- Afficher toutes les notifications de club
SELECT 
  'Notifications de club:' as info,
  cn.id,
  cn.club_id,
  c.name as club_name,
  LEFT(cn.message, 50) as message,
  cn.created_at
FROM club_notifications cn
LEFT JOIN clubs c ON c.id = cn.club_id
ORDER BY cn.created_at DESC
LIMIT 5;

-- Afficher les jobs club_notification
SELECT 
  'Jobs club_notification:' as info,
  nj.id,
  nj.kind,
  array_length(nj.recipients, 1) as nb_recipients,
  nj.payload->>'club_id' as club_id,
  nj.payload->>'title' as title,
  LEFT(nj.payload->>'message', 50) as message,
  nj.created_at
FROM notification_jobs nj
WHERE nj.kind = 'club_notification'
ORDER BY nj.created_at DESC
LIMIT 5;

