# Guide : Créer la vue leaderboard_view

## 🔍 Problème

L'erreur indique que la vue `leaderboard_view` n'existe pas dans la base de données :
```
Could not find the table 'public.leaderboard_view' in the schema cache
```

## 🔧 Solution

### Étape 1 : Exécuter la migration

Exécutez la migration `supabase/migrations/20251206130000_create_leaderboard_view_if_missing.sql` dans le Dashboard Supabase :

1. Allez sur https://supabase.com/dashboard
2. Sélectionnez votre projet
3. Cliquez sur **"SQL Editor"**
4. Cliquez sur **"+ New query"**
5. Copiez-collez le contenu de la migration
6. Cliquez sur **"Run"**

### Étape 2 : Vérifier que la vue existe

Exécutez ce SQL pour vérifier :

```sql
-- Vérifier que la vue existe
SELECT 
  table_name,
  table_type
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name = 'leaderboard_view';
```

Vous devriez voir `leaderboard_view` avec `table_type = 'VIEW'`.

### Étape 3 : Tester la vue

Exécutez ce SQL pour tester que la vue fonctionne :

```sql
-- Tester la vue
SELECT 
  user_id,
  display_name,
  rating,
  level,
  xp,
  rank_global,
  rank_club
FROM leaderboard_view
ORDER BY rank_global
LIMIT 10;
```

### Étape 4 : Vérifier dans l'app

1. Rechargez l'app
2. Allez sur `/leaderboard`
3. Vérifiez que le leaderboard s'affiche correctement
4. Testez les 3 scopes (Global, Mon club, Mon groupe)

## 📋 Contenu de la migration

La migration crée une vue `leaderboard_view` qui :
- Joint `player_ratings` et `profiles`
- Calcule le rang global (tous les joueurs)
- Calcule le rang par club (si le joueur a un club)
- Inclut toutes les infos nécessaires (rating, level, xp, etc.)

## ✅ Résultat attendu

Après avoir exécuté la migration :
- ✅ La vue `leaderboard_view` existe
- ✅ Le leaderboard s'affiche dans l'app
- ✅ Les 3 scopes fonctionnent (Global, Mon club, Mon groupe)
- ✅ Plus d'erreur "[useLeaderboard] Error fetching leaderboard"

