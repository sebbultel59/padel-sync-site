# Solution : rating_history non rempli

## 🔍 Problème

Les entrées apparaissent dans `rating_update_queue` mais pas dans `rating_history`.

## 📊 Explication

1. **L'Edge Function `record-match-result`** :
   - Met à jour les ratings dans `player_ratings` ✅
   - Essaie d'insérer dans `rating_history` (ligne 588-590)
   - Mais l'insertion peut échouer silencieusement si la table n'existe pas ou si RLS bloque

2. **Le trigger SQL** :
   - Crée une entrée dans `rating_update_queue` quand `match_results.status = 'completed'`
   - Cette queue n'est jamais traitée (pas de worker)

## 🔧 Solution en 3 étapes

### Étape 1 : Exécuter la migration mise à jour

Exécutez la migration `supabase/migrations/20251206120000_create_rating_history_if_missing.sql` dans le Dashboard Supabase.

Cette migration :
- ✅ Crée la table `rating_history` si elle n'existe pas
- ✅ Ajoute les index nécessaires
- ✅ Configure les politiques RLS (y compris une politique pour permettre l'insertion)

### Étape 2 : Vérifier les logs de l'Edge Function

Dans le Dashboard Supabase :
1. Allez dans **"Edge Functions"** → **"record-match-result"**
2. Cliquez sur **"Logs"**
3. Cherchez les messages :
   - `[record_match_result] Error inserting rating_history:` (erreur)
   - `[record_match_result] Rating history inserted successfully:` (succès)

### Étape 3 : Tester avec un nouveau match

1. Enregistrez un nouveau match via l'app
2. Vérifiez que des entrées sont créées dans `rating_history` :

```sql
SELECT * FROM rating_history ORDER BY created_at DESC LIMIT 5;
```

## 🎯 Si ça ne fonctionne toujours pas

### Option A : Traiter manuellement les entrées de la queue

Si vous avez des entrées dans `rating_update_queue` qui n'ont pas été traitées :

```sql
-- Voir les entrées en attente
SELECT * FROM rating_update_queue WHERE status = 'pending' ORDER BY created_at DESC;
```

Pour chaque entrée, vous pouvez appeler l'Edge Function `update-match-ratings` depuis l'app ou via une requête HTTP.

### Option B : Désactiver le trigger (si vous utilisez uniquement l'Edge Function)

Si vous utilisez uniquement l'Edge Function `record-match-result` et que vous ne voulez pas utiliser la queue :

```sql
-- Désactiver le trigger qui crée des entrées dans rating_update_queue
DROP TRIGGER IF EXISTS trigger_queue_rating_update ON match_results;
```

**Note** : Cette option n'est recommandée que si vous êtes sûr que l'Edge Function fonctionne correctement.

## ✅ Résultat attendu

Après avoir exécuté la migration et testé avec un nouveau match :
- ✅ Les entrées apparaissent dans `rating_history`
- ✅ Les ratings sont mis à jour dans `player_ratings`
- ✅ Le leaderboard se met à jour automatiquement

