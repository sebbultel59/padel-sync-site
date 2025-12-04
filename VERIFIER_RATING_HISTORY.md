# Vérification : rating_history non rempli

## 🔍 Diagnostic

Les entrées apparaissent dans `rating_update_queue` mais pas dans `rating_history`.

## 📊 Causes possibles

1. **La table `rating_history` n'existe pas** → Exécutez la migration `20251206120000_create_rating_history_if_missing.sql`
2. **L'insertion échoue silencieusement** → Vérifiez les logs de l'Edge Function
3. **Problème de permissions RLS** → Le SERVICE_ROLE_KEY devrait bypasser RLS, mais vérifions

## 🔧 Actions à faire

### 1. Vérifier que la table existe

Exécutez ce SQL dans le Dashboard Supabase :

```sql
-- Vérifier que la table existe
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_name = 'rating_history';
```

Si la table n'existe pas, exécutez la migration `20251206120000_create_rating_history_if_missing.sql`.

### 2. Vérifier les logs de l'Edge Function

Dans le Dashboard Supabase :
1. Allez dans **"Edge Functions"** → **"record-match-result"**
2. Cliquez sur **"Logs"**
3. Cherchez les messages :
   - `[record_match_result] Error inserting rating_history:` (erreur)
   - `[record_match_result] Rating history inserted successfully:` (succès)

### 3. Tester l'insertion manuellement

Exécutez ce SQL pour tester si l'insertion fonctionne :

```sql
-- Tester l'insertion dans rating_history
INSERT INTO rating_history (user_id, rating_before, rating_after, delta, match_id)
SELECT 
  id,
  50.0,
  52.5,
  2.5,
  NULL
FROM profiles
LIMIT 1;

-- Vérifier que l'insertion a fonctionné
SELECT * FROM rating_history ORDER BY created_at DESC LIMIT 5;
```

### 4. Traiter les entrées en attente dans la queue

Si vous avez des entrées dans `rating_update_queue` qui n'ont pas été traitées, vous pouvez les traiter manuellement :

```sql
-- Voir les entrées en attente
SELECT * FROM rating_update_queue WHERE status = 'pending' ORDER BY created_at DESC;

-- Pour chaque entrée, appeler l'Edge Function update-match-ratings
-- (à faire depuis l'app ou via une requête HTTP)
```

## 🎯 Solution immédiate

1. **Exécutez la migration** `20251206120000_create_rating_history_if_missing.sql` si la table n'existe pas
2. **Vérifiez les logs** de l'Edge Function pour voir pourquoi l'insertion échoue
3. **Testez l'insertion manuellement** pour vérifier que les permissions fonctionnent

Une fois la table créée et les permissions vérifiées, les prochains matchs enregistrés devraient créer des entrées dans `rating_history`.

