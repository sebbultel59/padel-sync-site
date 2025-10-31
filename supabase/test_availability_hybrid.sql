-- Tests du modèle hybride availability_global + availability

-- 1) Vérifier que la table availability_global existe et fonctionne
SELECT * FROM availability_global LIMIT 5;

-- 2) Vérifier que la vue availability_effective fonctionne
-- (Remplace GROUP_ID par un ID réel de ton groupe)
SELECT * FROM availability_effective 
WHERE group_id = 'TON_GROUP_ID_ICI'
LIMIT 10;

-- 3) Tester la fonction get_availability_effective
-- (Remplace GROUP_ID par un ID réel, et ajuste les dates)
SELECT * FROM get_availability_effective(
  'TON_GROUP_ID_ICI'::uuid,
  NULL, -- tous les users
  '2025-01-13 00:00:00+00'::timestamptz,
  '2025-01-20 00:00:00+00'::timestamptz
);

-- 4) Comparer availability vs availability_global
-- Vérifier qu'il n'y a pas de doublons dans la vue
SELECT user_id, group_id, start, "end", status, COUNT(*) as cnt
FROM availability_effective
GROUP BY user_id, group_id, start, "end", status
HAVING COUNT(*) > 1;

-- 5) Tester l'insertion globale manuellement
-- (Remplace USER_ID par ton ID réel)
/*
SELECT set_availability_global(
  'TON_USER_ID_ICI'::uuid,
  '2025-01-15 10:00:00+00'::timestamptz,
  '2025-01-15 10:30:00+00'::timestamptz,
  'available'
);
*/

-- 6) Vérifier que les membres du groupe voient les disponibilités globales
-- (Remplace GROUP_ID par un ID réel)
SELECT 
  ag.user_id,
  ag.start,
  ag."end",
  ag.status,
  'global' as source
FROM availability_global ag
JOIN group_members gm ON gm.user_id = ag.user_id
WHERE gm.group_id = 'TON_GROUP_ID_ICI'
UNION ALL
SELECT 
  a.user_id,
  a.start,
  a."end",
  a.status,
  'exception' as source
FROM availability a
WHERE a.group_id = 'TON_GROUP_ID_ICI';

