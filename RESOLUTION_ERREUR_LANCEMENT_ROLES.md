# Résolution de l'erreur au lancement - Système de rôles

## Problème

Si vous obtenez une erreur au lancement de l'application liée aux rôles, c'est probablement parce que les colonnes `role` et `club_id` n'existent pas encore dans la table `profiles`.

## Solution rapide

### 1. Exécuter la migration de vérification

Exécutez cette migration dans le **Dashboard Supabase** → **SQL Editor** :

```sql
-- Fichier: supabase/migrations/ensure_roles_column_exists.sql
```

Cette migration :
- ✅ Vérifie si la colonne `role` existe, sinon la crée
- ✅ Vérifie si la colonne `club_id` existe, sinon la crée
- ✅ Migre les données existantes (super_admins → super_admin, admins → admin)
- ✅ Crée les index nécessaires

### 2. Ordre d'exécution des migrations (si nécessaire)

Si vous devez exécuter toutes les migrations manuellement, voici l'ordre :

1. `add_roles_to_profiles.sql` (ou `ensure_roles_column_exists.sql`)
2. `enhance_clubs_table.sql`
3. `create_club_management_tables.sql`
4. `create_role_check_functions.sql`
5. `update_rpc_functions_for_roles.sql`
6. `create_update_user_role_function.sql`
7. `fix_groups_rls_for_club_managers.sql`

### 3. Vérification

Après avoir exécuté les migrations, vérifiez que tout fonctionne :

```sql
-- Vérifier que la colonne role existe
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'profiles' 
AND column_name IN ('role', 'club_id');

-- Vérifier que les fonctions existent
SELECT routine_name
FROM information_schema.routines 
WHERE routine_name IN (
  'is_super_admin',
  'is_club_manager', 
  'is_group_admin',
  'can_manage_group',
  'rpc_create_group'
);
```

## Erreurs courantes

### "column profiles.role does not exist"
→ Exécutez `ensure_roles_column_exists.sql`

### "permission denied for table groups"
→ Exécutez `fix_groups_rls_for_club_managers.sql`

### "function rpc_create_group does not exist"
→ Exécutez `update_rpc_functions_for_roles.sql`

## Code mis à jour

Le hook `useUserRole` dans `lib/roles.js` a été rendu plus robuste pour gérer le cas où les colonnes n'existent pas encore. Il utilisera `'player'` par défaut en cas d'erreur.

## Après correction

Une fois les migrations exécutées, redémarrez l'application. L'erreur devrait disparaître.











