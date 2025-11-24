# Vérification des migrations de rôles

## Méthode 1 : Script SQL de vérification

1. Ouvrez le **Dashboard Supabase** : https://supabase.com/dashboard
2. Sélectionnez votre projet
3. Allez dans **SQL Editor**
4. Exécutez le fichier `supabase/migrations/verify_roles_migration.sql`

Ce script vérifiera :
- ✅ Les colonnes `role` et `club_id` dans `profiles`
- ✅ Les colonnes enrichies dans `clubs` (call_button_*, logo_url, description, etc.)
- ✅ Les tables `club_posts` et `club_notifications`
- ✅ Les fonctions de rôles (is_super_admin, is_club_manager, etc.)
- ✅ La migration des données (super_admins → super_admin, admins → admin)
- ✅ La distribution des rôles
- ✅ Les fonctions RPC mises à jour

## Méthode 2 : Vérifications manuelles rapides

### Vérifier les colonnes de rôles
```sql
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'profiles' 
AND column_name IN ('role', 'club_id');
```

### Vérifier les fonctions
```sql
SELECT routine_name, routine_type
FROM information_schema.routines 
WHERE routine_name IN (
  'is_super_admin',
  'is_club_manager', 
  'is_group_admin',
  'can_manage_group'
);
```

### Vérifier la migration des données
```sql
-- Vérifier les super_admins migrés
SELECT COUNT(*) as super_admins_count
FROM profiles 
WHERE role = 'super_admin';

-- Vérifier les admins migrés
SELECT COUNT(*) as admins_count
FROM profiles 
WHERE role = 'admin';

-- Vérifier les club_managers
SELECT COUNT(*) as club_managers_count
FROM profiles 
WHERE role = 'club_manager';
```

### Tester une fonction
```sql
-- Remplacer 'VOTRE_USER_ID' par votre UUID
SELECT is_super_admin('VOTRE_USER_ID'::uuid);
```

## Méthode 3 : Test depuis l'application

### 1. Vérifier votre rôle dans l'écran Profil

1. **Ouvrez l'application** et allez dans l'onglet **"Profil"** (icône personne en bas)
2. **Faites défiler vers le bas** jusqu'à la section "Rôle actuel"
3. **Vérifiez que votre rôle s'affiche correctement** :
   - 👑 Super Admin (violet)
   - 🔧 Admin (bleu)
   - 🏢 Club Manager (jaune)
   - 👤 Joueur (gris)

### 2. Accéder à l'interface de gestion des rôles (Super Admin)

**Option A : Via le bouton dans le Profil**
- Si vous êtes super_admin, un bouton **"Gestion des rôles"** (violet) apparaît dans l'écran Profil
- Cliquez dessus pour accéder à `/admin/roles`

**Option B : Navigation directe (pour test)**
- Dans votre code, vous pouvez naviguer directement avec :
  ```javascript
  router.push('/admin/roles');
  ```
- Ou depuis la console du navigateur (web) :
  ```javascript
  window.location.href = '/admin/roles';
  ```

### 3. Tester l'interface de gestion des rôles

Une fois sur `/admin/roles`, vous devriez voir :
- ✅ Une liste de tous les utilisateurs avec leurs rôles
- ✅ Des filtres par rôle (Tous, Joueurs, Admins, Club Managers, Super Admins)
- ✅ Un champ de recherche pour trouver un utilisateur
- ✅ La possibilité de cliquer sur un utilisateur pour modifier son rôle
- ✅ Pour les club_managers : la possibilité d'assigner un club_id

### 4. Tester les permissions de groupe

1. **Créez ou rejoignez un groupe**
2. **Vérifiez que vous avez les bonnes permissions** :
   - Si vous êtes admin du groupe : vous pouvez modifier le nom, la visibilité, etc.
   - Si vous êtes club_manager : vous pouvez gérer les groupes de votre club
   - Si vous êtes super_admin : vous pouvez tout gérer

### 5. Tester la gestion de club (Club Manager)

1. **Promouvez-vous en club_manager** via `/admin/roles` (en tant que super_admin)
2. **Assignez-vous un club_id**
3. **Naviguez vers** `/clubs/[votre_club_id]/manage`
4. **Vous devriez pouvoir** :
   - Modifier la description du club
   - Configurer le logo
   - Configurer le bouton d'appel (label + numéro)
   - Voir les statistiques (groupes, posts)

2. **Test des permissions** :
   - En tant que super_admin : accédez à `/admin/roles`
   - En tant que club_manager : accédez à `/clubs/[id]/manage`
   - Vérifiez que les permissions de groupe fonctionnent correctement

3. **Test du bouton "Appeler le club"** :
   - Créez un match validé avec un club_id
   - Configurez le club avec `call_button_enabled = true` et `call_phone`
   - Vérifiez que le bouton apparaît sur les matchs validés

## Problèmes courants

### Si les colonnes n'existent pas
→ Exécutez `add_roles_to_profiles.sql` et `enhance_clubs_table.sql`

### Si les fonctions n'existent pas
→ Exécutez `create_role_check_functions.sql`

### Si les données ne sont pas migrées
→ Vérifiez que les tables `super_admins` et `admins` existent et contiennent des données
→ Relancez la migration `add_roles_to_profiles.sql`

### Si les fonctions RPC ne fonctionnent pas
→ Exécutez `update_rpc_functions_for_roles.sql`

## Ordre d'exécution des migrations

Si vous devez les exécuter manuellement, voici l'ordre :

1. `add_roles_to_profiles.sql`
2. `enhance_clubs_table.sql`
3. `create_club_management_tables.sql`
4. `create_role_check_functions.sql`
5. `update_rpc_functions_for_roles.sql`

