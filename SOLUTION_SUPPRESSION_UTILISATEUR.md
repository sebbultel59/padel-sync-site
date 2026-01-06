# Solution : Suppression d'utilisateur qui échoue

## 🔍 Diagnostic

L'erreur "Database error deleting user" (500) indique un problème côté base de données lors de la suppression.

## 📝 Étapes de diagnostic

### 1. Exécuter le script de diagnostic

1. Allez dans **SQL Editor** dans Supabase Dashboard
2. Ouvrez `diagnose_user_deletion_error.sql`
3. **Modifiez l'UUID** à la ligne 5 :
   ```sql
   v_user_id UUID := '12edb353-2333-4a92-9b7e-1a72b0395ff4'::UUID;
   ```
4. Remplacez par l'UUID de l'utilisateur à supprimer
5. Exécutez le script

Le script va :
- Vérifier si le profil existe
- Compter les références
- Essayer de supprimer étape par étape
- Afficher l'erreur exacte si elle se produit

### 2. Identifier la cause

Selon le message d'erreur affiché :

#### Si erreur "foreign key constraint"
→ Il reste une contrainte sans `ON DELETE`. Utilisez `find_missing_on_delete_constraints.sql` pour la trouver.

#### Si erreur "trigger"
→ Un trigger sur `profiles` échoue. Vérifiez les triggers avec :
```sql
SELECT tgname, pg_get_triggerdef(oid) 
FROM pg_trigger 
WHERE tgrelid = 'profiles'::regclass;
```

#### Si erreur "policy" ou "RLS"
→ Une politique RLS bloque. Vérifiez avec :
```sql
SELECT * FROM pg_policies WHERE tablename = 'profiles';
```

## 🔧 Solutions selon la cause

### Solution 1 : Supprimer manuellement les données liées

```sql
DO $$
DECLARE
  v_user_id UUID := '12edb353-2333-4a92-9b7e-1a72b0395ff4'::UUID;  -- ⚠️ CHANGEZ
BEGIN
  -- 1. Supprimer notification_jobs
  DELETE FROM notification_jobs WHERE actor_id = v_user_id;
  
  -- 2. Les autres tables sont gérées par CASCADE automatiquement
  -- (match_rsvps, group_members, availabilities, etc.)
  
  -- 3. Supprimer le profil
  DELETE FROM profiles WHERE id = v_user_id;
  
  -- 4. Supprimer le compte auth (nécessite permissions)
  DELETE FROM auth.users WHERE id = v_user_id;
END $$;
```

### Solution 2 : Utiliser la fonction delete_user_account()

Si l'utilisateur peut se connecter, utilisez la fonction RPC :

```sql
-- Se connecter en tant que l'utilisateur, puis :
SELECT delete_user_account();
```

### Solution 3 : Modifier la fonction pour accepter un UUID

Créez une fonction admin pour supprimer n'importe quel utilisateur :

```sql
CREATE OR REPLACE FUNCTION admin_delete_user_account(user_id_to_delete UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Supprimer les notification_jobs
  DELETE FROM notification_jobs WHERE actor_id = user_id_to_delete;
  
  -- Supprimer les RSVPs
  DELETE FROM match_rsvps WHERE user_id = user_id_to_delete;
  
  -- Supprimer les matchs créés
  DELETE FROM matches WHERE created_by = user_id_to_delete;
  
  -- Supprimer les disponibilités
  DELETE FROM availability WHERE user_id = user_id_to_delete;
  DELETE FROM availability_global WHERE user_id = user_id_to_delete;
  
  -- Supprimer les demandes de groupe
  DELETE FROM group_join_requests WHERE user_id = user_id_to_delete;
  
  -- Supprimer les invitations
  DELETE FROM invitations WHERE created_by = user_id_to_delete;
  
  -- Supprimer les membres de groupes
  DELETE FROM group_members WHERE user_id = user_id_to_delete;
  
  -- Supprimer les groupes créés
  DELETE FROM groups WHERE created_by = user_id_to_delete;
  
  -- Supprimer le profil
  DELETE FROM profiles WHERE id = user_id_to_delete;
  
  -- Supprimer le compte auth
  DELETE FROM auth.users WHERE id = user_id_to_delete;
END;
$$;

-- Utilisation :
SELECT admin_delete_user_account('12edb353-2333-4a92-9b7e-1a72b0395ff4'::UUID);
```

## 🧪 Test

1. **Exécutez le script de diagnostic** pour identifier la cause exacte
2. **Appliquez la solution appropriée** selon l'erreur
3. **Vérifiez que la suppression fonctionne**

## 📚 Notes

- La suppression via le dashboard Supabase utilise l'API `/admin/users/[id]` qui peut avoir des limitations
- La suppression manuelle via SQL donne plus de contrôle
- La fonction `delete_user_account()` est la méthode recommandée car elle gère toutes les dépendances

