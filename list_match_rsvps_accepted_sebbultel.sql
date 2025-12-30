-- Liste tous les match_rsvps avec status 'accepted' pour sebbultel59@gmail.com

SELECT 
  mr.match_id,
  mr.user_id,
  mr.status as rsvp_status,
  mr.created_at as rsvp_created_at,
  m.id as match_id,
  m.status as match_status,
  m.group_id,
  m.created_at as match_created_at,
  ts.starts_at,
  ts.ends_at,
  g.name as group_name,
  -- Compter les autres RSVPs accepted pour ce match
  (SELECT COUNT(*) 
   FROM match_rsvps mr2 
   WHERE mr2.match_id = m.id 
   AND mr2.status = 'accepted') as total_accepted_rsvps,
  -- Liste des autres joueurs accepted
  (SELECT ARRAY_AGG(p.display_name || ' (' || p.email || ')')
   FROM match_rsvps mr3
   JOIN profiles p ON p.id = mr3.user_id
   WHERE mr3.match_id = m.id 
   AND mr3.status = 'accepted'
   AND mr3.user_id != mr.user_id) as other_accepted_players
FROM match_rsvps mr
JOIN matches m ON m.id = mr.match_id
LEFT JOIN time_slots ts ON ts.id = m.time_slot_id
LEFT JOIN groups g ON g.id = m.group_id
WHERE mr.user_id = (SELECT id FROM auth.users WHERE email = 'sebbultel59@gmail.com' LIMIT 1)
  AND mr.status = 'accepted'
ORDER BY ts.starts_at DESC NULLS LAST, m.created_at DESC;

-- Résumé
SELECT 
  COUNT(*) as total_rsvps_accepted,
  COUNT(DISTINCT mr.match_id) as total_matches,
  COUNT(DISTINCT m.group_id) as total_groups,
  MIN(ts.starts_at) as oldest_match,
  MAX(ts.starts_at) as newest_match
FROM match_rsvps mr
JOIN matches m ON m.id = mr.match_id
LEFT JOIN time_slots ts ON ts.id = m.time_slot_id
WHERE mr.user_id = (SELECT id FROM auth.users WHERE email = 'sebbultel59@gmail.com' LIMIT 1)
  AND mr.status = 'accepted';

