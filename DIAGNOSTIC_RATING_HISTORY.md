# Diagnostic : rating_history non rempli

## 🔍 Problème identifié

Les entrées apparaissent dans `rating_update_queue` mais pas dans `rating_history`.

## 📊 Analyse

1. **L'Edge Function `record-match-result`** :
   - Met à jour les ratings dans `player_ratings` ✅
   - Essaie d'insérer dans `rating_history` (ligne 588-590)
   - Mais l'insertion peut échouer silencieusement (ligne 592-598)

2. **Le trigger SQL** :
   - Crée une entrée dans `rating_update_queue` quand `match_results.status = 'completed'`
   - Cette queue n'est jamais traitée (pas de worker)

## 🔧 Solutions possibles

### Solution 1 : Vérifier les logs de l'Edge Function

Dans le Dashboard Supabase :
1. Allez dans **"Edge Functions"** → **"record-match-result"**
2. Cliquez sur **"Logs"**
3. Cherchez les erreurs `[record_match_result] Error inserting rating_history:`

### Solution 2 : Vérifier que la table existe

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

### Solution 3 : Tester l'insertion manuellement

Exécutez ce SQL pour tester si l'insertion fonctionne :

```sql
-- Tester l'insertion dans rating_history
INSERT INTO rating_history (user_id, rating_before, rating_after, delta, match_id)
VALUES (
  (SELECT id FROM profiles LIMIT 1), -- Remplacez par un vrai user_id
  50.0,
  52.5,
  2.5,
  NULL
);

-- Vérifier que l'insertion a fonctionné
SELECT * FROM rating_history ORDER BY created_at DESC LIMIT 5;
```

### Solution 4 : Vérifier les permissions RLS

Les politiques RLS peuvent bloquer l'insertion. Vérifiez :

```sql
-- Voir les politiques RLS sur rating_history
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE tablename = 'rating_history';
```

## 🎯 Solution recommandée

Si la table `rating_history` existe mais que l'insertion échoue, c'est probablement un problème de permissions RLS. L'Edge Function utilise le `SERVICE_ROLE_KEY` qui devrait bypasser RLS, mais vérifions.

**Action immédiate** : Vérifiez les logs de l'Edge Function pour voir l'erreur exacte.

