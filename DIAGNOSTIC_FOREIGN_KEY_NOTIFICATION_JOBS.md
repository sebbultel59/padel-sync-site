# Diagnostic : Contrainte de clé étrangère notification_jobs

## 🔍 Problème identifié

La contrainte de clé étrangère `notification_jobs_actor_id_fkey` n'a pas de comportement `ON DELETE` défini, ce qui signifie qu'elle utilise `ON DELETE RESTRICT` par défaut.

Cela peut :
- ✅ **Empêcher la suppression** d'un profil s'il est référencé dans `notification_jobs` (comme vous l'avez vu)
- ⚠️ **Potentiellement bloquer la création** si un trigger essaie de créer une notification_job avec un actor_id invalide

## 🔧 Solution

J'ai créé une migration `fix_notification_jobs_actor_id_fkey.sql` qui :
1. Supprime l'ancienne contrainte
2. Recrée la contrainte avec `ON DELETE SET NULL`

Cela signifie que :
- Si un profil est supprimé, `actor_id` dans `notification_jobs` sera mis à `NULL`
- Cela n'empêchera plus la suppression de profils
- Cela ne devrait pas bloquer la création de comptes

## 📝 Pour appliquer la correction

### Option 1 : Via Supabase Dashboard

1. Allez dans **SQL Editor** dans Supabase Dashboard
2. Copiez le contenu de `supabase/migrations/fix_notification_jobs_actor_id_fkey.sql`
3. Exécutez la requête

### Option 2 : Via CLI Supabase

```bash
supabase migration new fix_notification_jobs_actor_id_fkey
# Copiez le contenu dans le fichier créé
supabase db push
```

## 🧪 Vérification

Après avoir appliqué la migration, testez :

1. **Créer un nouveau compte** dans l'application
2. **Vérifier que l'email de vérification est envoyé**
3. **Vérifier les logs Supabase** pour voir s'il y a des erreurs

## ⚠️ Note importante

Cette correction permet la suppression de profils, mais **ne devrait pas affecter la création de comptes** car :
- La création d'un profil ne crée normalement pas de `notification_jobs` automatiquement
- Les triggers qui créent des `notification_jobs` utilisent `SECURITY DEFINER` et gèrent les erreurs

Si le problème persiste après cette correction, il faut vérifier :
1. Les logs Supabase pour voir l'erreur exacte
2. Si un trigger essaie de créer une `notification_jobs` lors de la création d'un profil
3. Les autres contraintes de clé étrangère qui pourraient bloquer

## 🔍 Autres contraintes à vérifier

Vérifiez aussi les autres clés étrangères sur `profiles` :

```sql
SELECT 
  conname as constraint_name,
  conrelid::regclass as table_name,
  pg_get_constraintdef(oid) as constraint_definition
FROM pg_constraint
WHERE confrelid = 'profiles'::regclass
ORDER BY conname;
```

Si d'autres contraintes ont le même problème, appliquez la même correction.

