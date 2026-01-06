# Diagnostic complet : Suppression d'utilisateur

## ✅ Constraintes vérifiées

Toutes les contraintes de clé étrangère listées ont déjà `ON DELETE SET NULL` ou `ON DELETE CASCADE`, ce qui est correct.

## 🔍 Vérifications supplémentaires

### 1. Vérifier s'il y a des contraintes SANS ON DELETE

Exécutez cette requête pour trouver toutes les contraintes qui référencent `profiles` mais qui n'ont PAS de comportement `ON DELETE` :

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

Si cette requête retourne des résultats, ce sont ces contraintes qui bloquent la suppression.

### 2. Vérifier les triggers qui pourraient bloquer

```sql
SELECT 
  tgname as trigger_name,
  tgrelid::regclass as table_name,
  tgenabled as enabled,
  pg_get_triggerdef(oid) as trigger_definition
FROM pg_trigger
WHERE tgrelid = 'profiles'::regclass
AND tgenabled != 'D'  -- Exclure les triggers désactivés
ORDER BY tgname;
```

### 3. Vérifier les politiques RLS sur profiles

```sql
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
WHERE tablename = 'profiles'
ORDER BY policyname;
```

### 4. Vérifier les contraintes sur auth.users

Le problème pourrait aussi venir de `auth.users` :

```sql
SELECT 
  conname as constraint_name,
  conrelid::regclass as table_name,
  confrelid::regclass as referenced_table,
  pg_get_constraintdef(oid) as constraint_definition
FROM pg_constraint
WHERE confrelid = 'auth.users'::regclass
ORDER BY conrelid::regclass, conname;
```

### 5. Vérifier les erreurs exactes dans les logs

Dans Supabase Dashboard > Logs, cherchez les erreurs récentes lors de la tentative de suppression pour voir le message d'erreur exact.

## 🔧 Solutions possibles

### Solution 1 : Supprimer via la fonction delete_user_account()

Au lieu de supprimer directement via le dashboard, utilisez la fonction RPC `delete_user_account()` qui gère toutes les dépendances :

```sql
-- Dans SQL Editor
SELECT delete_user_account();
```

Cette fonction :
- Supprime toutes les données liées (RSVPs, matchs, disponibilités, etc.)
- Supprime le profil
- Supprime le compte auth

### Solution 2 : Supprimer manuellement les données liées

Si vous voulez supprimer via le dashboard, supprimez d'abord les données liées :

```sql
-- Remplacer USER_ID par l'UUID de l'utilisateur à supprimer
DO $$
DECLARE
  v_user_id UUID := 'USER_ID_ICI'::UUID;
BEGIN
  -- Supprimer les notification_jobs
  DELETE FROM notification_jobs WHERE actor_id = v_user_id;
  
  -- Supprimer les autres données (déjà gérées par CASCADE)
  -- match_rsvps, availabilities, etc. seront supprimés automatiquement
  
  -- Supprimer le profil
  DELETE FROM profiles WHERE id = v_user_id;
  
  -- Supprimer le compte auth
  DELETE FROM auth.users WHERE id = v_user_id;
END $$;
```

### Solution 3 : Vérifier les contraintes manquantes

Si la requête de l'étape 1 retourne des contraintes, créez une migration pour les corriger :

```sql
-- Exemple pour une contrainte problématique
ALTER TABLE nom_table 
DROP CONSTRAINT IF EXISTS nom_constraint_fkey;

ALTER TABLE nom_table
ADD CONSTRAINT nom_constraint_fkey 
FOREIGN KEY (colonne) 
REFERENCES profiles(id) 
ON DELETE SET NULL;  -- ou CASCADE selon le cas
```

## 🧪 Test de suppression

1. **Trouvez l'UUID de l'utilisateur** :
```sql
SELECT id, email FROM profiles WHERE email = 'sebbultel@hotmail.com';
```

2. **Vérifiez les données liées** :
```sql
SELECT 
  'notification_jobs' as table_name, COUNT(*) as count
FROM notification_jobs WHERE actor_id = 'USER_ID'::UUID
UNION ALL
SELECT 'match_rsvps', COUNT(*) FROM match_rsvps WHERE user_id = 'USER_ID'::UUID
UNION ALL
SELECT 'group_members', COUNT(*) FROM group_members WHERE user_id = 'USER_ID'::UUID;
```

3. **Essayez la suppression via la fonction** :
```sql
-- Se connecter en tant que l'utilisateur ou utiliser SECURITY DEFINER
SELECT delete_user_account();
```

## 📝 Checklist

- [ ] Vérifié toutes les contraintes avec la requête de l'étape 1
- [ ] Vérifié les triggers avec la requête de l'étape 2
- [ ] Vérifié les politiques RLS avec la requête de l'étape 3
- [ ] Vérifié les logs Supabase pour l'erreur exacte
- [ ] Testé la suppression via `delete_user_account()`
- [ ] Testé la suppression manuelle des données liées

