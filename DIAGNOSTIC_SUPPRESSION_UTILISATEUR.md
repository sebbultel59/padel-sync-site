# Diagnostic : Impossible de supprimer certains utilisateurs

## 🔍 Problème

Lors de la tentative de suppression d'un utilisateur (ex: `sebbultel@hotmail.com`), une erreur 500 se produit :
- "Database error deleting user"
- Erreur dans les logs : `DELETE /auth/v1/admin/users/[uuid]` → 500

## 🎯 Cause probable

Des contraintes de clé étrangère qui référencent `profiles` sans comportement `ON DELETE` approprié, ce qui bloque la suppression.

## 🔧 Solution

J'ai créé une migration complète `fix_all_profiles_foreign_keys.sql` qui corrige toutes les contraintes problématiques.

### Contraintes corrigées

1. **notification_jobs.actor_id** → `ON DELETE SET NULL`
2. **group_join_requests.reviewed_by** → `ON DELETE SET NULL`
3. **invitations.used_by** → `ON DELETE SET NULL`
4. **matches.created_by** → `ON DELETE SET NULL`
5. **groups.created_by** → `ON DELETE SET NULL`
6. **club_notifications.created_by** → `ON DELETE SET NULL`

## 📝 Pour appliquer la correction

### Option 1 : Via Supabase Dashboard (recommandé)

1. Allez dans **SQL Editor** dans Supabase Dashboard
2. Ouvrez le fichier `supabase/migrations/fix_all_profiles_foreign_keys.sql`
3. Copiez tout le contenu
4. Collez dans l'éditeur SQL
5. Cliquez sur **Run** ou **Execute**

### Option 2 : Via CLI Supabase

```bash
supabase migration new fix_all_profiles_foreign_keys
# Copiez le contenu dans le fichier créé
supabase db push
```

## 🧪 Test après correction

1. **Essayez de supprimer l'utilisateur** `sebbultel@hotmail.com` dans Supabase Dashboard
2. **Vérifiez que la suppression fonctionne** sans erreur
3. **Vérifiez que les données liées sont gérées correctement** :
   - Les `notification_jobs` avec cet `actor_id` auront `actor_id = NULL`
   - Les autres références seront mises à `NULL` automatiquement

## 🔍 Vérifier les contraintes avant/après

### Avant la migration

```sql
SELECT 
  conname as constraint_name,
  conrelid::regclass as table_name,
  pg_get_constraintdef(oid) as constraint_definition
FROM pg_constraint
WHERE confrelid = 'profiles'::regclass
ORDER BY conrelid::regclass, conname;
```

### Après la migration

Toutes les contraintes devraient avoir `ON DELETE SET NULL` ou `ON DELETE CASCADE`.

## ⚠️ Tables qui suppriment en cascade

Certaines tables peuvent avoir besoin de `ON DELETE CASCADE` au lieu de `SET NULL` :

- **match_rsvps.user_id** → `ON DELETE CASCADE` (supprimer les RSVPs)
- **group_members.user_id** → `ON DELETE CASCADE` (retirer du groupe)
- **availability.user_id** → `ON DELETE CASCADE` (supprimer les disponibilités)

Ces tables sont normalement gérées par la fonction `delete_user_account()` qui supprime explicitement ces données avant de supprimer le profil.

## 🆘 Si le problème persiste

1. **Vérifiez les logs Supabase** pour voir l'erreur exacte
2. **Exécutez cette requête** pour voir toutes les contraintes :

```sql
SELECT 
  conname as constraint_name,
  conrelid::regclass as table_name,
  pg_get_constraintdef(oid) as constraint_definition
FROM pg_constraint
WHERE confrelid = 'profiles'::regclass
AND pg_get_constraintdef(oid) NOT LIKE '%ON DELETE%'
ORDER BY conrelid::regclass, conname;
```

3. **Corrigez manuellement** les contraintes restantes avec la même méthode

## 📚 Note importante

Cette migration ne supprime pas les données liées, elle met simplement les références à `NULL`. Si vous voulez supprimer complètement toutes les données d'un utilisateur, utilisez la fonction `delete_user_account()` qui est déjà implémentée dans votre codebase.

