-- Script pour vérifier les RSVPs des matchs confirmés
-- Vérifie que sebbultel59@gmail.com est bien dans les RSVPs acceptés

SELECT 
  m.id as match_id,
  m.status as match_status,
  ts.starts_at,
  ts.ends_at,
  COUNT(mr.user_id) FILTER (WHERE mr.status = 'accepted') as total_accepted_rsvps,
  COUNT(mr.user_id) FILTER (WHERE mr.status = 'maybe') as total_maybe_rsvps,
  ARRAY_AGG(mr.user_id) FILTER (WHERE mr.status = 'accepted') as accepted_user_ids,
  ARRAY_AGG(p.display_name) FILTER (WHERE mr.status = 'accepted') as accepted_player_names,
  BOOL_OR(
    p.id = (SELECT id FROM auth.users WHERE email = 'sebbultel59@gmail.com' LIMIT 1) 
    AND mr.status = 'accepted'
  ) as sebbultel_in_accepted
FROM matches m
JOIN time_slots ts ON ts.id = m.time_slot_id
LEFT JOIN match_rsvps mr ON mr.match_id = m.id
LEFT JOIN profiles p ON p.id = mr.user_id
WHERE m.group_id = '9ad6a176-1935-416e-9ab3-ddba4d76434a'
  AND m.status = 'confirmed'
  AND ts.starts_at >= '2024-12-08'::date
  AND ts.starts_at < '2024-12-15'::date
GROUP BY m.id, m.status, ts.starts_at, ts.ends_at
ORDER BY ts.starts_at;

-- Vérifier tous les RSVPs pour ces matchs en détail
SELECT 
  m.id as match_id,
  ts.starts_at,
  mr.user_id,
  mr.status as rsvp_status,
  p.display_name,
  p.email,
  CASE 
    WHEN p.id = (SELECT id FROM auth.users WHERE email = 'sebbultel59@gmail.com' LIMIT 1) THEN 'OUI'
    ELSE 'NON'
  END as is_sebbultel
FROM matches m
JOIN time_slots ts ON ts.id = m.time_slot_id
LEFT JOIN match_rsvps mr ON mr.match_id = m.id
LEFT JOIN profiles p ON p.id = mr.user_id
WHERE m.group_id = '9ad6a176-1935-416e-9ab3-ddba4d76434a'
  AND m.status = 'confirmed'
  AND ts.starts_at >= '2024-12-08'::date
  AND ts.starts_at < '2024-12-15'::date
ORDER BY ts.starts_at, mr.status, p.display_name;









