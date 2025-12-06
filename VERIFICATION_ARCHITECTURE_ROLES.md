# Vérification de l'architecture des rôles

## ✅ Ce qui est correctement implémenté

### 1. Player (joueur) - Rôle par défaut
- ✅ Colonne `role` dans `profiles` avec valeur par défaut `'player'`
- ✅ Migration automatique des utilisateurs existants vers `'player'`
- ✅ Pas de restrictions spécifiques : peut créer/join des dispos, rejoindre des groupes, jouer des matchs

### 2. Admin de groupe
- ✅ Géré via `group_members.role` avec valeurs `'admin'` ou `'owner'`
- ✅ Le créateur du groupe devient automatiquement `'owner'` (dans `rpc_create_group`)
- ✅ Peut gérer les membres du groupe (via `can_manage_group`)
- ✅ Peut renommer/supprimer le groupe (via `can_manage_group` dans `rpc_update_group`)
- ✅ Peut gérer les règles propres au groupe (visibility, join_policy)

### 3. Club Manager (Dirigeant de club)
- ✅ Rôle `'club_manager'` avec `club_id` dans `profiles`
- ✅ Peut créer des groupes rattachés à son club (vérifié dans `rpc_create_group`)
- ✅ Peut voir l'activité de tous les groupes du club (affichage dans `app/clubs/[id]/manage.js`)
- ✅ Peut gérer la page club :
  - ✅ Description, logo (`logo_url`)
  - ✅ Horaires, tarifs (via `description` ou à ajouter)
  - ✅ Actus (`club_posts` table créée)
  - ✅ Liens sociaux (`social_links` JSONB)
- ✅ Peut configurer le bouton "Appeler le club" :
  - ✅ `call_button_enabled` (boolean)
  - ✅ `call_button_label` (text)
  - ✅ `call_phone` (text)
- ✅ Interface de gestion complète dans `app/clubs/[id]/manage.js`

### 4. Super Admin
- ✅ Rôle `'super_admin'` dans `profiles`
- ✅ Interface de gestion des rôles dans `app/admin/roles.js`
- ✅ Peut modifier les rôles des utilisateurs (fonction `rpc_update_user_role`)
- ✅ Peut gérer clubs, utilisateurs, rôles
- ✅ Peut tout gérer (via `can_manage_group`, `is_super_admin`)

### 5. Bouton "Appeler le club"
- ✅ Affiché sur les matchs validés (dans `app/(tabs)/matches/index.js` ligne ~5346)
- ✅ Utilise `call_button_label` et `call_phone` depuis la table `clubs`
- ✅ S'affiche uniquement si le match a un `club_id` et que le club a `call_phone` configuré

## ⚠️ Points à vérifier / compléter

### 1. Promotion d'un admin de groupe par un club_manager
**Statut :** ⚠️ Non explicitement implémenté

**Détails :**
- Un club_manager peut gérer les groupes de son club via `can_manage_group`
- Mais il n'y a pas de fonction RPC spécifique pour promouvoir un membre en admin de groupe
- **Action suggérée :** Créer une fonction `rpc_promote_group_admin(group_id, user_id)` qui vérifie que l'appelant est club_manager du club du groupe

### 2. Voir les matchs générés dans les groupes du club
**Statut :** ⚠️ Partiellement implémenté

**Détails :**
- La table `matches` a un `group_id` qui peut être utilisé pour filtrer
- Un club_manager peut voir les groupes de son club dans `app/clubs/[id]/manage.js`
- Mais il n'y a pas d'interface spécifique pour voir tous les matchs de tous les groupes du club
- **Action suggérée :** Ajouter une section "Matchs" dans `app/clubs/[id]/manage.js` qui affiche tous les matchs des groupes du club

### 3. Envoyer des notifications aux membres des groupes du club
**Statut :** ⚠️ Table créée mais interface manquante

**Détails :**
- La table `club_notifications` existe avec RLS policies correctes
- Un club_manager peut créer des notifications (policy RLS en place)
- Mais il n'y a pas d'interface dans `app/clubs/[id]/manage.js` pour envoyer des notifications
- **Action suggérée :** Ajouter une section "Notifications" dans `app/clubs/[id]/manage.js` avec un formulaire pour créer des notifications qui seront envoyées aux membres de tous les groupes du club

## 📋 Résumé des migrations créées

1. ✅ `add_roles_to_profiles.sql` - Ajoute `role` et `club_id` à `profiles`, migre les données
2. ✅ `enhance_clubs_table.sql` - Ajoute `logo_url`, `description`, `social_links`, `call_button_*`
3. ✅ `create_club_management_tables.sql` - Crée `club_posts` et `club_notifications` avec RLS
4. ✅ `create_role_check_functions.sql` - Fonctions `is_super_admin`, `is_club_manager`, `is_group_admin`, `can_manage_group`
5. ✅ `update_rpc_functions_for_roles.sql` - Met à jour toutes les fonctions RPC pour utiliser le nouveau système
6. ✅ `create_update_user_role_function.sql` - Fonction pour les super_admins pour modifier les rôles

## 📋 Résumé des fichiers frontend créés/modifiés

1. ✅ `lib/roles.js` - Hooks `useUserRole`, `useIsSuperAdmin`, `useIsClubManager`, `useIsGroupAdmin`, `useCanManageGroup`
2. ✅ `app/admin/roles.js` - Interface de gestion des rôles pour super_admins
3. ✅ `app/clubs/[id]/manage.js` - Interface de gestion de club pour club_managers
4. ✅ `app/(tabs)/groupes.js` - Utilise les nouveaux hooks de rôles
5. ✅ `app/(tabs)/matches/index.js` - Affiche le bouton "Appeler le club" sur les matchs validés

## ✅ Conclusion

L'architecture des rôles est **globalement bien implémentée** avec :
- ✅ Tous les rôles définis (player, admin, club_manager, super_admin)
- ✅ Toutes les tables nécessaires créées
- ✅ Toutes les fonctions de vérification créées
- ✅ Interface de gestion des rôles pour super_admins
- ✅ Interface de gestion de club pour club_managers
- ✅ Bouton "Appeler le club" fonctionnel

**Points à compléter :**
1. Fonction pour promouvoir un admin de groupe (club_manager)
2. Interface pour voir les matchs de tous les groupes du club (club_manager)
3. Interface pour envoyer des notifications aux membres des groupes du club (club_manager)

Ces points sont mineurs et peuvent être ajoutés facilement si nécessaire.











