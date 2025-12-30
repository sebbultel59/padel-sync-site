-- Script pour supprimer les matches où sebbultel59@gmail.com est le seul joueur
-- Un match avec un seul joueur = un seul RSVP avec status 'accepted' ou 'maybe'

DO $$
DECLARE
  sebbultel_id UUID;
  match_rec RECORD;
  deleted_matches_count INTEGER := 0;
  deleted_rsvps_count INTEGER := 0;
BEGIN
  -- 1. Trouver l'ID de l'utilisateur sebbultel59@gmail.com
  SELECT id INTO sebbultel_id
  FROM auth.users
  WHERE email = 'sebbultel59@gmail.com'
  LIMIT 1;
  
  IF sebbultel_id IS NULL THEN
    RAISE EXCEPTION 'Utilisateur sebbultel59@gmail.com non trouvé';
  END IF;
  
  RAISE NOTICE '✅ Utilisateur trouvé: % (sebbultel59@gmail.com)', sebbultel_id;
  RAISE NOTICE '';
  
  -- 2. Trouver tous les matches où sebbultel est le seul joueur
  -- Un match avec un seul joueur = un seul RSVP (celui de sebbultel)
  FOR match_rec IN
    SELECT 
      m.id as match_id,
      m.group_id,
      m.status,
      ts.starts_at,
      ts.ends_at,
      COUNT(mr.user_id) as rsvp_count
    FROM matches m
    JOIN match_rsvps mr ON mr.match_id = m.id
    LEFT JOIN time_slots ts ON ts.id = m.time_slot_id
    WHERE mr.user_id = sebbultel_id
    GROUP BY m.id, m.group_id, m.status, ts.starts_at, ts.ends_at
    HAVING COUNT(mr.user_id) = 1  -- Un seul RSVP = sebbultel seul
    ORDER BY ts.starts_at DESC
  LOOP
    RAISE NOTICE 'Match trouvé avec un seul joueur:';
    RAISE NOTICE '  Match ID: %', match_rec.match_id;
    RAISE NOTICE '  Status: %', match_rec.status;
    RAISE NOTICE '  Date: % -> %', match_rec.starts_at, match_rec.ends_at;
    RAISE NOTICE '  RSVPs: %', match_rec.rsvp_count;
    
    -- Supprimer les RSVPs de ce match
    DELETE FROM match_rsvps WHERE match_id = match_rec.match_id;
    GET DIAGNOSTICS deleted_rsvps_count = ROW_COUNT;
    RAISE NOTICE '  RSVPs supprimés: %', deleted_rsvps_count;
    
    -- Supprimer le match
    DELETE FROM matches WHERE id = match_rec.match_id;
    GET DIAGNOSTICS deleted_matches_count = ROW_COUNT;
    RAISE NOTICE '  Match supprimé: %', deleted_matches_count;
    RAISE NOTICE '';
  END LOOP;
  
  RAISE NOTICE '✅ Suppression terminée!';
  RAISE NOTICE '   Tous les matches où sebbultel59@gmail.com était le seul joueur ont été supprimés.';
  
END $$;

-- Vérification : Afficher les matches restants de sebbultel avec le nombre de joueurs
SELECT 
  m.id as match_id,
  m.status,
  ts.starts_at,
  ts.ends_at,
  COUNT(mr.user_id) as nb_players,
  ARRAY_AGG(p.display_name ORDER BY p.display_name) FILTER (WHERE mr.status IN ('accepted', 'maybe')) as player_names
FROM matches m
JOIN match_rsvps mr ON mr.match_id = m.id
LEFT JOIN time_slots ts ON ts.id = m.time_slot_id
LEFT JOIN profiles p ON p.id = mr.user_id
WHERE mr.user_id = (SELECT id FROM auth.users WHERE email = 'sebbultel59@gmail.com' LIMIT 1)
  AND mr.status IN ('accepted', 'maybe')
GROUP BY m.id, m.status, ts.starts_at, ts.ends_at
HAVING COUNT(mr.user_id) >= 2  -- Au moins 2 joueurs
ORDER BY ts.starts_at DESC
LIMIT 20;

