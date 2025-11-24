# Diagnostic : Notifications de club ne fonctionnent pas

## Problème
Les notifications envoyées par les club managers ne créent pas de `notification_jobs` et ne sont donc pas envoyées.

## Étapes de diagnostic

### 1. Vérifier que le trigger existe

Exécutez dans Supabase SQL Editor :

```sql
SELECT 
  tgname as trigger_name,
  tgrelid::regclass as table_name,
  tgenabled as enabled
FROM pg_trigger 
WHERE tgname = 'club_notifications_to_jobs_trigger';
```

**Résultat attendu :** Une ligne avec le trigger. Si vide → **Exécutez la migration** `trigger_club_notifications_to_jobs.sql`

### 2. Vérifier que la fonction existe

```sql
SELECT 
  proname as function_name,
  prosecdef as security_definer
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
AND p.proname = 'process_club_notification';
```

**Résultat attendu :** Une ligne avec `security_definer = true`. Si vide → **Exécutez la migration**

### 3. Vérifier les notifications de club existantes

```sql
SELECT 
  cn.id,
  cn.club_id,
  c.name as club_name,
  cn.message,
  cn.created_at
FROM club_notifications cn
LEFT JOIN clubs c ON c.id = cn.club_id
ORDER BY cn.created_at DESC
LIMIT 5;
```

**Vérifiez :** Y a-t-il des notifications ? Si oui, notez le `club_id`.

### 4. Vérifier que les groupes ont un club_id

```sql
SELECT 
  g.id as group_id,
  g.name as group_name,
  g.club_id,
  c.name as club_name,
  COUNT(gm.user_id) as nombre_membres
FROM groups g
LEFT JOIN clubs c ON c.id = g.club_id
LEFT JOIN group_members gm ON gm.group_id = g.id
WHERE g.club_id IS NOT NULL
GROUP BY g.id, g.name, g.club_id, c.name
ORDER BY nombre_membres DESC;
```

**Problème possible :** Si les groupes n'ont pas de `club_id`, le trigger ne trouvera aucun membre.

**Solution :** Associez les groupes au club :
```sql
UPDATE groups 
SET club_id = 'VOTRE_CLUB_ID'
WHERE id = 'VOTRE_GROUP_ID';
```

### 5. Vérifier les membres des groupes d'un club spécifique

Remplacez `'VOTRE_CLUB_ID'` par l'ID réel d'un club :

```sql
SELECT 
  g.id as group_id,
  g.name as group_name,
  COUNT(DISTINCT gm.user_id) as nombre_membres,
  ARRAY_AGG(DISTINCT gm.user_id) as membres_ids
FROM groups g
INNER JOIN group_members gm ON gm.group_id = g.id
WHERE g.club_id = 'VOTRE_CLUB_ID'
GROUP BY g.id, g.name;
```

**Résultat attendu :** Des groupes avec des membres. Si vide → **Aucun membre dans les groupes du club**

### 6. Tester le trigger manuellement

Créez une notification de test et vérifiez les logs :

```sql
-- Remplacez les UUIDs par des valeurs réelles
DO $$
DECLARE
  v_club_id UUID := 'VOTRE_CLUB_ID';
  v_user_id UUID := 'VOTRE_USER_ID';
  v_notification_id UUID;
  v_job_count INTEGER;
BEGIN
  -- Créer une notification de test
  INSERT INTO club_notifications (club_id, message, created_by)
  VALUES (v_club_id, 'Test notification - ' || NOW()::text, v_user_id)
  RETURNING id INTO v_notification_id;
  
  RAISE NOTICE 'Notification créée: %', v_notification_id;
  
  -- Attendre un peu pour que le trigger s'exécute
  PERFORM pg_sleep(1);
  
  -- Vérifier si un job a été créé
  SELECT COUNT(*) INTO v_job_count
  FROM notification_jobs 
  WHERE kind = 'club_notification' 
  AND payload->>'club_id' = v_club_id::text
  AND created_at > NOW() - INTERVAL '1 minute';
  
  IF v_job_count > 0 THEN
    RAISE NOTICE '✅ SUCCÈS: % job(s) créé(s)', v_job_count;
  ELSE
    RAISE WARNING '❌ ÉCHEC: Aucun job créé';
    RAISE NOTICE 'Vérifiez les logs Supabase pour voir les messages RAISE NOTICE du trigger';
  END IF;
END $$;
```

### 7. Vérifier les logs du trigger

Dans Supabase Dashboard :
- Allez dans **Database > Logs** ou **Database > Postgres Logs**
- Cherchez les messages commençant par `[process_club_notification]`
- Vous devriez voir :
  - `Début traitement notification`
  - `Club "..." a X groupe(s)`
  - `X membre(s) trouvé(s)`
  - `✅ Job créé avec succès` ou `❌ Erreur`

## Solutions selon le problème

### Problème 1 : Trigger n'existe pas
**Solution :** Exécutez la migration :
```bash
supabase db push
```
Ou copiez-collez le contenu de `trigger_club_notifications_to_jobs.sql` dans Supabase SQL Editor.

### Problème 2 : Groupes sans club_id
**Solution :** Associez les groupes au club :
```sql
UPDATE groups 
SET club_id = 'VOTRE_CLUB_ID'
WHERE id IN ('GROUP_ID_1', 'GROUP_ID_2', ...);
```

### Problème 3 : Aucun membre dans les groupes
**Solution :** Vérifiez que les utilisateurs sont bien membres des groupes :
```sql
SELECT * FROM group_members WHERE group_id = 'VOTRE_GROUP_ID';
```

### Problème 4 : Trigger ne se déclenche pas
**Solution :** Vérifiez les permissions RLS sur `club_notifications`. Le trigger doit pouvoir lire `groups` et `group_members`.

## Après correction

Une fois le trigger fonctionnel, les `notification_jobs` seront créés automatiquement. Vérifiez ensuite que `dispatch-notifs` est appelé (via webhook, cron, ou trigger).

