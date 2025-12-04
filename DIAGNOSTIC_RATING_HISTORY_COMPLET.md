# Diagnostic complet : rating_history non rempli

## 🔍 Problèmes identifiés

1. **Edge Function non redéployée** : L'ancienne version essaie encore de mettre à jour `matches.status` à `'completed'`
2. **rating_history vide** : Aucune entrée n'est créée après l'enregistrement d'un match

## 📊 Checklist de vérification

### 1. Vérifier que la table rating_history existe

Exécutez ce SQL dans le Dashboard :

```sql
-- Vérifier que la table existe
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_name = 'rating_history';

-- Si la table n'existe pas, exécutez la migration :
-- supabase/migrations/20251206120000_create_rating_history_if_missing.sql
```

### 2. Vérifier les permissions RLS

```sql
-- Voir les politiques RLS sur rating_history
SELECT 
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE tablename = 'rating_history';
```

Vous devriez voir au moins :
- `Anyone can view rating history` (SELECT)
- `Service role can insert rating history` (INSERT)

### 3. Redéployer l'Edge Function

**Via CLI** :
```bash
cd /Users/sebbultel/padel-sync
supabase functions deploy record-match-result
```

**Via Dashboard** :
1. Edge Functions → record-match-result → Deploy

### 4. Tester l'insertion manuellement

Pour vérifier que l'insertion fonctionne :

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

-- Nettoyer le test
DELETE FROM rating_history WHERE match_id IS NULL AND rating_before = 50.0;
```

### 5. Vérifier les logs de l'Edge Function

Après avoir enregistré un match, vérifiez les logs :

**Logs attendus (succès)** :
- `[record_match_result] Rating history inserted successfully: 4`
- `[record_match_result] Match result recorded, matches.status unchanged`

**Logs d'erreur possibles** :
- `[record_match_result] Error inserting rating_history: {...}` → Copiez l'erreur complète

### 6. Vérifier que match_result est créé avec status='completed'

```sql
-- Vérifier les derniers match_results
SELECT 
  id,
  match_id,
  status,
  winner_team,
  recorded_at
FROM match_results
ORDER BY recorded_at DESC
LIMIT 5;
```

Le `status` doit être `'completed'` et `winner_team` ne doit pas être NULL.

## 🎯 Actions à faire

1. ✅ **Exécuter la migration** `20251206120000_create_rating_history_if_missing.sql` si la table n'existe pas
2. ✅ **Redéployer l'Edge Function** `record-match-result`
3. ✅ **Enregistrer un nouveau match** via l'app
4. ✅ **Vérifier les logs** de l'Edge Function
5. ✅ **Vérifier rating_history** avec la requête SQL ci-dessus

## 🐛 Si ça ne fonctionne toujours pas

Si après avoir fait toutes ces étapes, `rating_history` est toujours vide :

1. **Copiez l'erreur complète** des logs de l'Edge Function
2. **Vérifiez que `ratingUpdates` n'est pas vide** dans les logs
3. **Vérifiez que `historyEntries` est bien créé** dans les logs

Envoyez-moi les logs complets et je vous aiderai à identifier le problème.

