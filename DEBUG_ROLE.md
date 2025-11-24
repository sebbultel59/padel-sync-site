# Debug du rôle super_admin

## Vérification rapide dans Supabase

Exécutez cette requête dans le SQL Editor pour vérifier votre rôle :

```sql
-- Remplacer 'VOTRE_EMAIL' par votre email
SELECT id, email, role, club_id 
FROM profiles 
WHERE email = 'VOTRE_EMAIL';
```

Si `role` est `NULL` ou `'player'`, alors :

1. **Vérifiez que la migration a été appliquée** :
   ```sql
   SELECT column_name FROM information_schema.columns 
   WHERE table_name = 'profiles' AND column_name = 'role';
   ```
   Devrait retourner `role`

2. **Vérifiez que vous êtes dans la table super_admins** :
   ```sql
   SELECT * FROM super_admins;
   ```

3. **Si vous êtes dans super_admins mais pas migré, exécutez manuellement** :
   ```sql
   -- Remplacer 'VOTRE_USER_ID' par votre UUID
   UPDATE profiles 
   SET role = 'super_admin' 
   WHERE id = 'VOTRE_USER_ID';
   ```

## Vérification dans la console du navigateur

Ouvrez la console (F12) et exécutez :

```javascript
// Vérifier votre rôle
const { data: auth } = await supabase.auth.getUser();
console.log('User ID:', auth?.user?.id);

const { data: profile, error } = await supabase
  .from('profiles')
  .select('id, email, role, club_id')
  .eq('id', auth?.user?.id)
  .single();

console.log('Profil:', profile);
console.log('Rôle:', profile?.role);
console.log('Erreur:', error);
```

## Solution rapide

Si vous êtes sûr d'être super_admin, vous pouvez temporairement désactiver la vérification dans `app/admin/roles.js` pour tester, puis la réactiver :

```javascript
// TEMPORAIRE - à retirer après test
useEffect(() => {
  // if (role !== 'super_admin') {
  //   Alert.alert("Accès refusé", "Seuls les super admins peuvent accéder à cette page");
  //   router.back();
  //   return;
  // }
}, [role, roleLoading]);
```

