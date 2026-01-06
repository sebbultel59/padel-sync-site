# Solution : Politique RLS DELETE manquante sur profiles

## 🔍 Problème identifié

Il n'y a **aucune politique RLS pour DELETE** sur la table `profiles`. Si RLS est activé, cela empêche toute suppression, même via le dashboard Supabase.

## ✅ Solution

J'ai créé une migration `add_delete_policy_profiles.sql` qui ajoute trois politiques DELETE :

1. **"profiles: owner delete"** : Permet à un utilisateur de supprimer son propre profil
2. **"profiles: super_admin delete"** : Permet aux super_admins de supprimer n'importe quel profil (si la colonne `role` existe)
3. **"profiles: functions delete"** : Permet aux fonctions avec `SECURITY DEFINER` de supprimer (pour `delete_user_account()`)

## 📝 Pour appliquer la correction

1. Allez dans **SQL Editor** dans Supabase Dashboard
2. Ouvrez `add_delete_policy_profiles.sql`
3. Exécutez la requête

## 🧪 Test après correction

1. **Essayez de supprimer l'utilisateur** `sebbultel@hotmail.com` dans Supabase Dashboard
2. La suppression devrait maintenant fonctionner

## ⚠️ Note importante

La politique `"profiles: functions delete"` avec `USING (true)` permet à **toutes** les fonctions avec `SECURITY DEFINER` de supprimer n'importe quel profil. C'est nécessaire pour que la fonction `delete_user_account()` fonctionne, mais assurez-vous que seules les fonctions de confiance ont `SECURITY DEFINER`.

## 🔒 Sécurité

Si vous voulez restreindre davantage, vous pouvez modifier la politique pour n'autoriser que certaines fonctions :

```sql
DROP POLICY IF EXISTS "profiles: functions delete" ON profiles;
CREATE POLICY "profiles: functions delete"
ON profiles
FOR DELETE
USING (
  -- Vérifier que c'est bien une fonction SECURITY DEFINER qui appelle
  current_setting('request.jwt.claims', true)::json->>'role' = 'service_role'
  OR
  -- Ou vérifier le nom de la fonction appelante
  current_function() = 'delete_user_account'
);
```

Mais pour la plupart des cas, `USING (true)` est suffisant car seules les fonctions marquées `SECURITY DEFINER` peuvent contourner RLS.

